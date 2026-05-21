/**
 * Hub launcher — opens prototypes as full pages (no iframe).
 * Theme / sound settings sync via localStorage on each prototype page.
 */

document.querySelectorAll('[data-prototype]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const src = btn.dataset.prototype;
    if (!src) return;
    window.location.assign(src);
  });
});

/** Deep link: index.html?p=workflow-intro → workflow-intro/ */
const initial = new URLSearchParams(location.search).get('p');
if (initial) {
  window.location.replace(`${initial.replace(/\/$/, '')}/`);
}
