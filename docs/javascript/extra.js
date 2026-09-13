/* Subtle polish for Castcut docs */
document.addEventListener('DOMContentLoaded', () => {
  const hero = document.querySelector('.ps-hero');
  if (!hero) {
    return;
  }
  document.body.classList.add('ps-home');
});
