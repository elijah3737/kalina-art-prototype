(() => {
  const toggle = document.querySelector('[data-search-toggle]');
  document.querySelector('[data-inline-search-close]')?.addEventListener('click', () => {
    toggle.click();
    toggle.focus();
  });
})();
