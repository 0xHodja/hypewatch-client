<script lang="ts">
  import "../app.css";
  import NavBar from "./NavBar.svelte";
  let { children } = $props();
</script>

<div class="app">
  <NavBar />
  <main>
    {@render children()}
  </main>
</div>
