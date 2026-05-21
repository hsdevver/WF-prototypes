/**
 * Hub launcher — opens prototypes as full pages (no iframe).
 * Theme / sound settings sync via localStorage on each prototype page.
 */

function prototypeUrl(relativePath) {
  const target = new URL(relativePath, location.href);
  const params = new URLSearchParams(location.search);
  params.delete('p');
  params.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return `${target.pathname}${target.search}${target.hash}`;
}

document.querySelectorAll('[data-prototype]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const src = btn.dataset.prototype;
    if (!src) return;
    window.location.assign(prototypeUrl(src));
  });
});

/** Deep link: index.html?p=workflow-intro → workflow-intro/ (keeps other query params) */
const initial = new URLSearchParams(location.search).get('p');
if (initial) {
  window.location.replace(prototypeUrl(`${initial.replace(/\/$/, '')}/`));
}
