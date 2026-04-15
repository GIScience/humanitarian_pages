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
  padding: 0.25rem 1rem;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);

  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;

  font-size: 0.8rem;
}

.footer-left {
  display: flex;
  gap: 0.4rem;
}

.footer-btn {
  padding: 0.5rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: #f7f7f7;
  text-decoration: none;
  color: var(--color-text);
  font-weight: 600;
}

.footer-btn:hover {
  background: #eee;
}

.footer-center {
  color: #555;
  text-align: center;
  flex: 1;
}

.ohsome-link {
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: #fff;

  display: inline-flex;
  align-items: center;
  gap: 0.35rem;

  text-decoration: none;
  color: var(--color-text);
  font-weight: 700;
  font-size: 0.6rem;
  letter-spacing: 0.04em;
}

.ohsome-link img {
  height: 25px;
  display: block;
}

.ohsome-link:hover {
  background: #f3f3f3;
}

.ohsome-text {
  white-space: nowrap;
}

.footer-right {
  color: #555;
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
