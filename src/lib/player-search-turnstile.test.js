import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playerSearchTurnstileToken } from './player-search-turnstile.js';

describe('Explicit player-search Turnstile lifecycle', () => {
  let options;
  let turnstile;
  const token = (signal = new AbortController().signal) => playerSearchTurnstileToken(document.createElement('div'), 'site-key', 'registration_player_search', 'de', signal);
  beforeEach(() => {
    turnstile = {
      render: vi.fn((_element, config) => { options = config; return 'widget'; }),
      execute: vi.fn(() => options.callback('single-use-token')), remove: vi.fn(),
    };
    window.turnstile = turnstile;
  });
  afterEach(() => { delete window.turnstile; vi.useRealTimers(); });

  it('renders, executes and removes a fresh widget for each action', async () => {
    await expect(token()).resolves.toBe('single-use-token');
    await expect(token()).resolves.toBe('single-use-token');
    expect(turnstile.render).toHaveBeenCalledTimes(2);
    expect(options).toMatchObject({ execution: 'execute', action: 'registration_player_search', sitekey: 'site-key' });
    expect(turnstile.remove).toHaveBeenCalledTimes(2);
  });

  it('rejects provider errors and removes the widget', async () => {
    turnstile.execute.mockImplementation(() => options['error-callback']());
    await expect(token()).rejects.toThrow();
    expect(turnstile.remove).toHaveBeenCalledWith('widget');
  });

  it('cancels a pending challenge when the form unmounts', async () => {
    turnstile.execute.mockImplementation(() => {});
    const controller = new AbortController();
    const promise = token(controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(promise).rejects.toThrow();
    expect(turnstile.remove).toHaveBeenCalledWith('widget');
  });

  it('does not leave timers running if the provider throws synchronously', async () => {
    vi.useFakeTimers();
    turnstile.render.mockImplementation(() => { throw new Error('provider'); });
    await expect(token()).rejects.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a challenge that times out', async () => {
    vi.useFakeTimers();
    turnstile.execute.mockImplementation(() => {});
    const promise = token();
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
    expect(turnstile.remove).toHaveBeenCalledWith('widget');
  });
});
