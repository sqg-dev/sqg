type Level = 'error' | 'warning' | 'info';

class StatusState {
  message = $state<string | null>(null);
  level = $state<Level>('info');

  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, level: Level = 'info', autoClearMs = 0) {
    if (this.timer) clearTimeout(this.timer);
    this.message = message;
    this.level = level;
    if (autoClearMs > 0) {
      this.timer = setTimeout(() => this.clear(), autoClearMs);
    }
  }

  error(message: string) {
    this.show(message, 'error');
  }

  warn(message: string) {
    this.show(message, 'warning', 5000);
  }

  info(message: string) {
    this.show(message, 'info', 3000);
  }

  clear() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.message = null;
  }
}

export const statusState = new StatusState();
