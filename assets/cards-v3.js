(() => {
  const gallery = document.querySelector('[data-card-style]');
  if (!gallery) return;
  const buttons = [...gallery.querySelectorAll('[data-card-design]')];
  const apply = value => {
    if (!buttons.some(b => b.dataset.cardDesign === value)) return;
    gallery.dataset.cardStyle = value;
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cardDesign === value)));
  };
  apply(new URLSearchParams(location.search).get('cards'));
  buttons.forEach(button => button.addEventListener('click', () => {
    apply(button.dataset.cardDesign);
    gallery.querySelector("h2").scrollIntoView({block:"start", behavior:"instant"});
    const url = new URL(location.href);
    url.searchParams.set('cards', button.dataset.cardDesign);
    history.replaceState(null, '', url);
  }));
})();
