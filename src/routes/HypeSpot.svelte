<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { createChart } from "lightweight-charts";
  import DoubleRangeSlider from "./DoubleRangeSlider.svelte";

  // modal
  import { Modal } from "@skeletonlabs/skeleton-svelte";

  let openState = $state(false);

  const modalClose = () => {
    openState = false;
  };

  const modalOpen = (user: string) => {
    modalUser = user;
    fetchUserInfo();
    openState = true;
    loadingModalUser = true;
  };

  let modalUser = $state("");
  let loadingModalUser = $state(false);

  let modalUserAccountInfo = $state({
    perps: null,
    spot: null,
  });

  const fetchUserInfo = async () => {
    try {
      const response = await fetch(`https://api.hyperliquid.xyz/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "clearinghouseState",
          user: modalUser,
        }),
      });
      const data = await response.json();
      modalUserAccountInfo["perps"] = data.assetPositions.filter((position: any) => position.position.coin == "HYPE");
      loadingModalUser = false;
      console.log(modalUserAccountInfo);
    } catch (error) {
      console.error("Error fetching user perps info:", error);
    }
    try {
      const response = await fetch(`https://api.hyperliquid.xyz/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "spotClearinghouseState",
          user: modalUser,
        }),
      });
      const data = await response.json();
      modalUserAccountInfo["spot"] = data.balances.filter((balance: any) => balance.coin == "HYPE" || balance.coin == "USDC");
    } catch (error) {
      console.error("Error fetching user spot info:", error);
    }
  };

  // app
  let ws: WebSocket;

  let trades: any[] = $state([]);
  let tradesHistorical: any[] = $state([]);
  let tradesWebsocket: any[] = $state([]);
  let tradesInitialised: boolean = $state(false);

  let tradeCVDInitialised: boolean = $state(false);
  let tradeCVD: any[] = $state([]);

  let candles: any[] = $state([]);

  let refreshingUserBalances: boolean = $state(false);

  let dataStartTime: number = $state(0);
  let dataEndTime: number = $state(0);
  let sliderStartTime: number = $state(0);
  let sliderEndTime: number = $state(1);
  let selectedStartTime: number = $derived((dataEndTime - dataStartTime) * sliderStartTime + dataStartTime);
  let selectedEndTime: number = $derived((dataEndTime - dataStartTime) * sliderEndTime + dataStartTime);
  let sliderStartTimeFormatted: string = $derived(
    new Date(selectedStartTime).toLocaleString("en-GB", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );
  let sliderEndTimeFormatted: string = $derived(
    new Date(selectedEndTime).toLocaleString("en-GB", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );

  let candleChartContainer: HTMLDivElement;
  let priceChart: any;
  let candleSeries: any;
  let cvdSeries: any;

  let userInfo: Record<string, any> = $state({});

  let isLoading: boolean = $state(true);

  let userTradeSummary = $derived(
    trades.reduce((acc: Record<string, any>, trade) => {
      if (trade.time < selectedStartTime || trade.time > selectedEndTime) {
        return acc;
      }

      const [buyer, seller] = trade.users;

      if (!acc[buyer]) {
        acc[buyer] = { buys: 0, sells: 0, takerVolume: 0, makerVolume: 0, netVolume: 0 };
      }

      if (!acc[seller]) {
        acc[seller] = { buys: 0, sells: 0, takerVolume: 0, makerVolume: 0, netVolume: 0 };
      }

      if (trade.side == "B") {
        acc[buyer].buys += 1;
        acc[buyer].takerVolume += Number(trade.sz);
        acc[seller].makerVolume -= Number(trade.sz);
        acc[buyer].netVolume += Number(trade.sz);
        acc[seller].netVolume -= Number(trade.sz);
      } else {
        acc[seller].sells += 1;
        acc[seller].takerVolume -= Number(trade.sz);
        acc[buyer].makerVolume += Number(trade.sz);
        acc[seller].netVolume -= Number(trade.sz);
        acc[buyer].netVolume += Number(trade.sz);
      }

      return acc;
    }, {})
  );

  let aggressiveBuyers = $derived(
    Object.entries(userTradeSummary)
      .filter(([_, user]) => user.netVolume > 0)
      .sort((a, b) => b[1].netVolume - a[1].netVolume)
      .slice(0, 10)
  );

  let aggressiveSellers = $derived(
    Object.entries(userTradeSummary)
      .filter(([_, user]) => user.netVolume < 0)
      .sort((a, b) => a[1].netVolume - b[1].netVolume)
      .slice(0, 10)
  );

  const shortenHash = (hash: string, length: number = 3) => {
    return hash.slice(0, 2 + length) + "..." + hash.slice(-length);
  };

  const hypurrscan_url = (hash: string) => {
    return `https://hypurrscan.io/address/${hash}`;
  };

  const hyperdash_url = (hash: string) => {
    return `https://hyperdash.info/trader/${hash}`;
  };

  const formatNumber = (number: number) => {
    try {
      return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    } catch (error) {
      return number;
    }
  };

  const updateTakerUserBalances = async () => {
    [...aggressiveBuyers, ...aggressiveSellers].forEach(async (user) => {
      const balances = await getUserBalances(user[0]);
      userInfo[user[0]] = {
        USDC: Math.floor(balances.find((item: any) => item.coin === "USDC")?.total ?? 0),
        HYPE: Math.floor(balances.find((item: any) => item.coin === "HYPE")?.total ?? 0),
      };
    });
  };

  const updateSingleTakerUserBalance = async (user: string) => {
    const balances = await getUserBalances(user);
    userInfo[user] = {
      USDC: Math.floor(balances.find((item: any) => item.coin === "USDC")?.total ?? 0),
      HYPE: Math.floor(balances.find((item: any) => item.coin === "HYPE")?.total ?? 0),
    };
  };

  const getUserBalances = async (user: string) => {
    const response = await fetch(`https://api.hyperliquid.xyz/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "spotClearinghouseState",
        user: user,
      }),
    });
    const data = await response.json();
    const balance = data.balances;
    refreshingUserBalances = false;
    return balance;
  };

  onMount(() => {
    ws = new WebSocket("wss://api.hyperliquid.xyz/ws");

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          method: "subscribe",
          subscription: {
            type: "trades",
            coin: "@107",
          },
        })
      );

      ws.send(
        JSON.stringify({
          method: "subscribe",
          subscription: {
            type: "candle",
            coin: "@107",
            interval: "1m",
          },
        })
      );

      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "candleSnapshot",
          req: {
            coin: "@107",
            interval: "1m",
            startTime: Date.now() - 5000 * 60 * 1000,
            endTime: Date.now(),
          },
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          candles = data.sort((a: any, b: any) => b.t - a.t);
        })
        .catch((error) => {
          console.error("Error fetching candle snapshot:", error);
        });

      fetch("/api/trades", {
        headers: {
          Accept: "application/json",
        },
      })
        .then((response) => response.json())
        .then((data) => {
          tradesHistorical = data.trades.map((trade: any) => ({
            coin: trade.coin,
            side: trade.side,
            px: Number(trade.px),
            sz: Number(trade.sz),
            time: trade.time,
            timeRounded: Math.floor(trade.time / 60000) * 60000,
            hash: trade.hash,
            tid: trade.tid,
            users: trade.users,
          }));
        });
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.channel === "trades") {
        const newTrades = data.data.map((trade: any) => ({
          ...trade,
          time: trade.time,
          timeRounded: Math.floor(trade.time / 60000) * 60000,
        }));

        // before trades initialised, log them
        if (!tradesInitialised && (tradesHistorical.length == 0 || tradesWebsocket.length == 0)) {
          tradesWebsocket = [...newTrades, ...tradesWebsocket];
        } else if (!tradesInitialised && tradesHistorical.length > 0 && tradesWebsocket.length > 0) {
          const filteredNewTrades = tradesHistorical.filter((trade: any) => !tradesWebsocket.some((histTrade: any) => histTrade.tid === trade.tid));
          trades = [...newTrades, ...filteredNewTrades, ...tradesWebsocket];
          trades.sort((a: any, b: any) => a.time - b.time);
          dataStartTime = Math.min(...trades.map((t: any) => t.time));
          dataEndTime = Math.max(...trades.map((t: any) => t.time));
          tradesInitialised = true; // at this point the trade table is initialised
          isLoading = false;
          // update aggressive buyers and sellers
          updateTakerUserBalances();
        } else if (tradesInitialised) {
          trades = [...newTrades, ...trades];
          dataEndTime = Math.max(...trades.map((t: any) => t.time));

          const aggressiveUsers = [...aggressiveBuyers, ...aggressiveSellers];
          trades.forEach((trade: any) => {
            if (trade.users[0] in aggressiveUsers) {
              updateSingleTakerUserBalance(trade.users[0]);
            } else if (trade.users[1] in aggressiveUsers) {
              updateSingleTakerUserBalance(trade.users[1]);
            }
          });
        }

        if (!tradeCVDInitialised && tradesInitialised) {
          tradeCVD = [...trades];
          tradeCVD = tradeCVD
            .sort((a: any, b: any) => a.timeRounded - b.timeRounded) // ascending order (oldest to newest)
            .reduce((acc: { timeRounded: number; cumulativeVolume: number }[], trade) => {
              const lastEntry = acc[acc.length - 1];
              const lastVolume = acc.length > 0 ? lastEntry.cumulativeVolume : 0;
              const volumeDelta = trade.side === "B" ? Number(trade.sz) : -Number(trade.sz);
              if (acc.length > 0 && lastEntry.timeRounded === trade.timeRounded) {
                lastEntry.cumulativeVolume += volumeDelta;
                return acc;
              } else {
                return [...acc, { timeRounded: trade.timeRounded, cumulativeVolume: lastVolume + volumeDelta }];
              }
            }, []);
          tradeCVDInitialised = true;
        } else if (tradeCVDInitialised) {
          newTrades.forEach((trade: any) => {
            const latestCVDEntry = tradeCVD[tradeCVD.length - 1];
            const volumeDelta = trade.side === "B" ? Number(trade.sz) : -Number(trade.sz);
            if (latestCVDEntry && latestCVDEntry.timeRounded === trade.timeRounded) {
              tradeCVD[tradeCVD.length - 1].cumulativeVolume += volumeDelta;
            } else {
              tradeCVD = [...tradeCVD, { timeRounded: trade.timeRounded, cumulativeVolume: latestCVDEntry ? latestCVDEntry.cumulativeVolume + volumeDelta : volumeDelta }];
            }
          });
        }
      }
      if (data.channel === "candle") {
        const candleIndex = candles.findIndex((candle) => candle.t === data.data.t);
        if (candleIndex !== -1) {
          candles[candleIndex] = data.data;
        } else {
          candles = [data.data, ...candles];
        }
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    priceChart = createChart(candleChartContainer, {
      width: window.innerWidth,
      height: 800,
      layout: {
        background: { color: "#1E1E1E" },
        textColor: "#DDD",
      },
      grid: {
        vertLines: { color: "#2B2B2B" },
        horzLines: { color: "#2B2B2B" },
      },
      timeScale: {
        timeVisible: true,
      },
      rightPriceScale: {
        visible: true,
      },
    });

    candleSeries = priceChart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    cvdSeries = priceChart.addLineSeries({
      color: "#ffeb3b",
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "cvd",
      priceScale: {
        position: "left",
      },
    });

    // Handle resize
    const handleResize = () => {
      priceChart.resize(window.innerWidth, 800);
    };
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  });

  onDestroy(() => {
    if (ws) {
      ws.close();
    }
  });

  $effect(() => {
    const formattedCandles = candles
      .map((candle) => ({
        time: new Date(candle.t).getTime() / 1000,
        open: Number(candle.o),
        high: Number(candle.h),
        low: Number(candle.l),
        close: Number(candle.c),
      }))
      .sort((a: any, b: any) => a.time - b.time);
    candleSeries.setData(formattedCandles);
    const formattedCVD = tradeCVD.map((item: any) => ({ time: new Date(item.timeRounded).getTime() / 1000, value: Number(item.cumulativeVolume) })).sort((a: any, b: any) => a.time - b.time);
    cvdSeries.setData(formattedCVD);
  });
</script>

<div class="flex flex-col gap-4 items-center grow w-full min-w-full max-w-full">
  <div class="flex flex-row gap-4 w-full">
    <div class="w-full" bind:this={candleChartContainer}></div>
  </div>
  {#if isLoading}
    <div class="flex flex-col items-center p-5 justify-center h-full">
      <div class="spinner"></div>
      <span>Loading data...</span>
    </div>
  {:else}
    <div class="flex flex-row gap-4 items-center justify-center max-w-screen-sm">
      <span class="whitespace-nowrap">{sliderStartTimeFormatted}</span>
      <div class="slider-container">
        <DoubleRangeSlider bind:start={sliderStartTime} bind:end={sliderEndTime} />
      </div>
      <span class="whitespace-nowrap">{sliderEndTimeFormatted}</span>
    </div>
    <div class="flex flex-row gap-6 justify-center flex-wrap">
      <button
        class="btn btn-primary border-2 border-gray-600 rounded-md content-center hover:bg-gradient-to-tl hover:from-stone-900 hover:to-orange-600"
        disabled={refreshingUserBalances}
        onclick={() => {
          refreshingUserBalances = true;
          updateTakerUserBalances();
        }}>{refreshingUserBalances ? "Refreshing..." : "Refresh USDC/HYPE Balances"}</button
      >
      <button
        class="btn btn-primary border-2 border-gray-600 rounded-md content-center hover:bg-gradient-to-tl hover:from-stone-900 hover:to-orange-600"
        onclick={() => {
          try {
            sliderStartTime = Math.max(1 - (60 * 1000 * 30) / (dataEndTime - dataStartTime), 0);
            sliderEndTime = 1;
          } catch (error) {
            console.error("Error setting slider times:", error);
          }
        }}>Show Last 30 minutes</button
      >
    </div>

    <div class="flex flex-row gap-6 justify-center flex-wrap">
      <div class="items-center border-2 border-gray-600 rounded-md">
        <table class="table table-auto">
          <thead class="sticky top-0 bg-gray-800">
            <tr>
              <th class="whitespace-nowrap text-center">Large Buyer</th>
              <th class="whitespace-nowrap text-center">Taker Buys</th>
              <th class="whitespace-nowrap text-center">Taker Volume</th>
              <th class="whitespace-nowrap text-center">Net Volume</th>
              <th class="whitespace-nowrap text-center">USDC Left</th>
            </tr>
          </thead>
          <tbody>
            {#each aggressiveBuyers.slice(0, 10) as buyer}
              <tr>
                <td class="whitespace-nowrap">
                  <span class="cursor-pointer text-blue-500 hover:text-blue-700" onclick={() => modalOpen(buyer[0])}>{shortenHash(buyer[0])}</span>
                  <a class="text-blue-500 hover:text-blue-700" href={hypurrscan_url(buyer[0])} target="_blank">[HS]</a> <a class="text-blue-500 hover:text-blue-700" href={hyperdash_url(buyer[0])} target="_blank">[HD]</a>
                </td><td class="whitespace-nowrap">{formatNumber(buyer[1].buys.toFixed(0))}</td>
                <td class="whitespace-nowrap {buyer[1].takerVolume >= 0 ? 'text-green-500' : 'text-red-500'}">{formatNumber(buyer[1].takerVolume.toFixed(0))}</td>
                <td class="whitespace-nowrap {buyer[1].netVolume >= 0 ? 'text-green-500' : 'text-red-500'}">{formatNumber(buyer[1].netVolume.toFixed(0))}</td>
                <td class="whitespace-nowrap">{userInfo[buyer[0]]?.USDC ? formatNumber(userInfo[buyer[0]].USDC) : formatNumber(0)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="items-center border-2 border-gray-600 rounded-md">
        <table class="table table-auto">
          <thead class="sticky top-0 bg-gray-800">
            <tr>
              <th class="whitespace-nowrap">Large Seller</th>
              <th class="whitespace-nowrap">Taker Sells</th>
              <th class="whitespace-nowrap text-center">Taker Volume</th>
              <th class="whitespace-nowrap text-center">Net Volume</th>
              <th class="whitespace-nowrap">HYPE Left</th>
            </tr>
          </thead>
          <tbody>
            {#each aggressiveSellers.slice(0, 10) as seller}
              <tr>
                <td class="whitespace-nowrap">
                  <span class="cursor-pointer text-blue-500 hover:text-blue-700" onclick={() => modalOpen(seller[0])}>{shortenHash(seller[0])}</span>
                  <a class="text-blue-500 hover:text-blue-700" href={hypurrscan_url(seller[0])} target="_blank">[HS]</a> <a class="text-blue-500 hover:text-blue-700" href={hyperdash_url(seller[0])} target="_blank">[HD]</a>
                </td>
                <td class="whitespace-nowrap">{formatNumber(seller[1].sells.toFixed(0))}</td>
                <td class="whitespace-nowrap {seller[1].takerVolume < 0 ? 'text-red-500' : 'text-green-500'}">{formatNumber(seller[1].takerVolume.toFixed(0))}</td>
                <td class="whitespace-nowrap {seller[1].netVolume >= 0 ? 'text-green-500' : 'text-red-500'}">{formatNumber(seller[1].netVolume.toFixed(0))}</td>
                <td class="whitespace-nowrap">{userInfo[seller[0]]?.HYPE ? formatNumber(userInfo[seller[0]].HYPE) : formatNumber(0)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="items-center border-2 border-gray-600 rounded-md" style="height: 500px; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none;">
        <table class="table table-auto">
          <thead class="sticky top-0 bg-gray-800">
            <tr>
              <th class="px-4 py-2">Price</th>
              <th class="px-4 py-2">Size</th>
              <th class="px-4 py-2">Time</th>
              <th class="px-4 py-2">Taker</th>
            </tr>
          </thead>
          <tbody>
            {#each trades.slice(0, 40) as trade}
              <tr>
                <td class="px-4 py-2">{trade.px}</td>
                <td class="px-4 py-2 {trade.side === 'B' ? 'text-green-500' : 'text-red-500'}">{trade.sz}</td>
                <td class="px-4 py-2">{new Date(trade.time).toLocaleTimeString()}</td>
                <td class="px-4 py-2 whitespace-nowrap">
                  <span class="cursor-pointer text-blue-500 hover:text-blue-700" onclick={() => modalOpen(trade.users[0])}>{shortenHash(trade.users[0])}</span>
                  <a class="text-blue-500 hover:text-blue-700" href={hypurrscan_url(trade.users[0])} target="_blank">[HS]</a> <a class="text-blue-500 hover:text-blue-700" href={hyperdash_url(trade.users[0])} target="_blank">[HD]</a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Modal open={openState} onOpenChange={(e) => (openState = e.open)} contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm" backdropClasses="backdrop-blur-sm">
        {#snippet content()}
          <header class="flex justify-between">
            <h5 class="h5">Account: {modalUser}</h5>
          </header>
          <article>
            {#if loadingModalUser}
              <p class="opacity-60">Loading...</p>
            {:else}
              <h5 class="h5">Perps (HYPE only)</h5>
              <p class="opacity-100">
                {#if modalUserAccountInfo.perps.length > 0}
                  {#each modalUserAccountInfo.perps as position}
                    <p class="opacity-60">{position.position.coin}: Size: {Number(position.position.szi).toFixed(0)} | Entry: {position.position.entryPx} | PnL: {position.position.unrealizedPnl} | LiqPrice: {position.position.liquidationPx}</p>
                  {/each}
                {:else}
                  <p class="opacity-60">No positions</p>
                {/if}
              </p>
              <h5 class="h5">Spot (HYPE and USDC)</h5>
              <p class="opacity-100">
                {#each modalUserAccountInfo?.spot ?? [] as coin}
                  <p class="opacity-60">{coin.coin}: {Number(coin.total).toFixed(0)}</p>
                {/each}
              </p>

              <h5 class="h5">Latest Trades</h5>

              <div class="items-center border-2 border-gray-600 rounded-md" style="height: 300px; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none;">
                <table class="table table-auto">
                  <thead class="sticky top-0 bg-gray-800">
                    <tr>
                      <th class="px-4 py-2">Price</th>
                      <th class="px-4 py-2">Size</th>
                      <th class="px-4 py-2">Time</th>
                      <th class="px-4 py-2">Taker & Maker</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each trades.filter((trade) => trade.users[0] === modalUser || trade.users[1] === modalUser) as trade}
                      <tr>
                        <td class="px-4 py-2">{trade.px}</td>
                        <td class="px-4 py-2 {trade.side === 'B' ? 'text-green-500' : 'text-red-500'}">{trade.sz}</td>
                        <td class="px-4 py-2">{new Date(trade.time).toLocaleTimeString()}</td>
                        <td class="px-4 py-2 whitespace-nowrap">
                          <span class="cursor-pointer text-blue-500 hover:text-blue-700" onclick={() => modalOpen(trade.users[0])}>{shortenHash(trade.users[0])}</span>
                          <a class="text-blue-500 hover:text-blue-700" href={hypurrscan_url(trade.users[0])} target="_blank">[HS]</a> <a class="text-blue-500 hover:text-blue-700" href={hyperdash_url(trade.users[0])} target="_blank">[HD]</a>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </article>
          <footer class="flex justify-end gap-4">
            <button type="button" class="btn preset-filled" onclick={modalClose}>Alright Buddy</button>
          </footer>
        {/snippet}
      </Modal>
    </div>
  {/if}
  <div class="flex flex-row gap-4">
    <span>Yellow line is the cumulative volume of the previous ~10,000 trades | Use the slider to filter the trades by time</span>
  </div>
</div>

<style>
  .slider-container {
    min-width: 400px;
    max-width: 100%;
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 5px solid #f3f3f3;
    border-top: 5px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
