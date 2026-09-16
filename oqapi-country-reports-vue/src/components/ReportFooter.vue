<script setup lang="ts">
</script>

<template>
  <footer class="footer">
    <div class="footer-left">
      <a class="footer-btn" href="https://heigit.org/contact/" target="_blank">Contact</a>
      <a class="footer-btn" href="https://heigit.org/privacy-policy/" target="_blank">Privacy Policy</a>
      <a class="footer-btn" href="https://heigit.org/imprint/" target="_blank">Imprint</a>
    </div>

    <div class="footer-center">
      <a
        href="https://dashboard.ohsome.org/en/#backend=ohsomeApi&groupBy=none&time=%2F2026-01-02T11%3A00Z%2FP1M&key=natural&value=tree&types=node&measure=count"
        target="_blank"
        class="ohsome-link"
      >
        <img src="https://dashboard.ohsome.org/en/assets/images/ohsome_narrow.svg" alt="ohsome">
        <span class="ohsome-text">DASHBOARD</span>
      </a>
    </div>

    <div class="footer-right">
      © {{ new Date().getFullYear() }} HeiGIT gGmbH
    </div>
  </footer>
</template>

<style scoped>
.footer {
  padding: 0.6rem 1.1rem;
  background: var(--paper-raised);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  border-radius: var(--radius);

  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;

  font-size: 0.78rem;
  font-family: var(--font-body);
}

.footer-left {
  display: flex;
  gap: 0.4rem;
}

.footer-btn {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--line-strong);
  background: transparent;
  text-decoration: none;
  color: var(--ink-soft);
  font-weight: 600;
  border-radius: var(--radius);
}

.footer-btn:hover {
  border-color: var(--accent);
  color: var(--ink);
}

.footer-right {
  color: var(--ink-faint);
}

.footer-center {
  color: var(--ink-faint);
  text-align: center;
  flex:1;
}

.ohsome-link {
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--line-strong);
  background: var(--paper-raised);
  border-radius: var(--radius);

  display: inline-flex;
  align-items: center;
  gap: 0.35rem;

  text-decoration: none;
  color: var(--ink-soft);
  font-weight: 700;
  font-size: 0.6rem;
  letter-spacing: 0.04em;
}

.ohsome-link img {
  height: 25px;
  display: block;
}

.ohsome-link:hover {
  background: var(--paper);
}

.ohsome-text {
  white-space: nowrap;
}

@media (max-width: 768px) {
  .footer {
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
  }

  .footer-left {
    width: 100%;
    justify-content: center;
  }

  .footer-btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
  }

  .footer-center {
    display: none;
  }

  .footer-right {
    text-align: center;
    width: 100%;
  }
}
</style>
