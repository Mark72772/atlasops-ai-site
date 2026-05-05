document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const value = button.getAttribute('data-copy') || '';
    await navigator.clipboard.writeText(value);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy link'; }, 1200);
  });
});