const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
const query = new URLSearchParams(window.location.search);
const storedContext = JSON.parse(localStorage.getItem('atlasops_utm_context') || '{}');
const context = { ...storedContext };
utmKeys.forEach((key) => {
  const value = query.get(key);
  if (value) context[key] = value.slice(0, 160);
});
context.referrer = context.referrer || document.referrer || '';
context.source_page = window.location.pathname;
if (window.location.pathname.includes('/go/')) {
  context.go_route = window.location.pathname;
}
localStorage.setItem('atlasops_utm_context', JSON.stringify(context));

document.querySelectorAll('.atlasops-lead-form').forEach((form) => {
  [...form.querySelectorAll('input[type="hidden"]')].forEach((field) => {
    if (field.name === 'source_page') field.value = window.location.pathname;
    else if (field.name === 'referrer') field.value = context.referrer || '';
    else if (field.name === 'go_route') field.value = context.go_route || '';
    else if (context[field.name]) field.value = context[field.name];
  });
  form.addEventListener('submit', (event) => {
    if (form.dataset.endpointStatus !== 'configured') {
      event.preventDefault();
      const note = form.querySelector('.form-note');
      if (note) note.textContent = 'Lead endpoint setup is pending. Use the PayPal/start-audit path now; Atlas will enable Formspree or Google Apps Script before collecting form leads.';
    }
  });
});

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const value = button.getAttribute('data-copy') || '';
    await navigator.clipboard.writeText(value);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy link'; }, 1200);
  });
});