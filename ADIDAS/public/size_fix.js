function onResize() {
  const fontRatio = window.innerHeight / 2160;
  document.documentElement.style.fontSize = `${fontRatio * 10}px`;
}

window.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('resize', onResize);
  onResize();
});
