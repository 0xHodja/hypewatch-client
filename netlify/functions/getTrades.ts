import { Config, Context } from "@netlify/functions";

const { MongoClient } = require('mongodb');

const uri = process.env.PROD_MONGODB_URI;
const client = new MongoClient(uri);

async function getTrades() {
  try {
    await client.connect();
    const database = client.db("hypewatch"); 
    const trades = database.collection("trades");
    
    const latestTrades = await trades.find({})
      .sort({ _id: -1 })
      .limit(50000)
      .toArray();
    
    return { trades: latestTrades };
  } catch (error) {
    console.error("Database connection error:", error);
    throw error;
  } finally {
    await client.close();
  }
}

export default async function handler(request: Request, context: Context) {
  try {
    const trades = await getTrades();
    if (!trades) {
      return new Response(JSON.stringify({ message: "No trades found" }), {
        status: 204,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify(trades), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config: Config = {
  path: "/api/trades"
};
