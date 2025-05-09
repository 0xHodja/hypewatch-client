<script lang="ts">
  // Add any navigation state or logic here
  import helpInfo from "$lib/images/help-info.png";
</script>

<nav>
  <div class="nav-content">
    <div class="logo">
      <h1>HypeWatch</h1>
    </div>
    <div
      class="help-button"
      role="button"
      tabindex="0"
      onclick={() => {
        const modal = document.createElement("div");
        modal.className = "help-modal";
        modal.innerHTML = `
        <div class="modal-content">
          <img src="${helpInfo}" alt="Help Information">
          <button class="close-button" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
      `;
        document.body.appendChild(modal);
      }}
    >
      Help
    </div>

    <div class="nav-right">
      <a href="https://x.com/HodjaTweet" target="_blank" class="twitter-link">
        <span class="nickname">Hodja</span>
        <svg class="twitter-icon" viewBox="0 0 24 24" width="16" height="16">
          <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
    </div>
  </div>
</nav>

<style>
  nav {
    background: #1a1a1a;
    padding: 0rem;
    margin: 0 0 0 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .nav-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
  }

  .logo h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .nav-right {
    display: flex;
    align-items: center;
  }

  .twitter-link {
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    color: #fff;
    gap: 0.5rem;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .twitter-link:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .twitter-icon {
    opacity: 0.8;
  }

  .help-button {
    cursor: pointer;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  .help-button:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  :global(.help-modal) {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  :global(.modal-content) {
    background: #1a1a1a;
    padding: 1rem;
    border-radius: 8px;
    position: relative;
    max-width: 90%;
    max-height: 90%;
  }

  :global(.modal-content img) {
    max-width: 100%;
    max-height: 80vh;
  }

  :global(.close-button) {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: none;
    border: none;
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
  }
</style>
