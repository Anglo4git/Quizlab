export class Router {
  constructor(render) { this.render = render; window.addEventListener('hashchange', () => this.renderCurrent()); }
  navigate(path) { window.location.hash = path; }
  get path() { return window.location.hash.replace(/^#/, '') || '/'; }
  renderCurrent() { this.render(this.path); }
}
