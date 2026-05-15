// quick-task-335: renderTemplate now consumes cached HTML strings; Tiptap runs in browser at save time.

import { describe, it, expect, vi } from 'vitest';
import { renderTemplate, substituteVariables } from '../template-renderer';

// ---------------------------------------------------------------------------
// substituteVariables tests (retained from prior test suite)
// ---------------------------------------------------------------------------
describe('substituteVariables', () => {
  it('replaces known tokens with payload values', () => {
    expect(
      substituteVariables('Hello {{name}}, your load is {{loadNumber}}', {
        name: 'Alex',
        loadNumber: 'LD-1042',
      }),
    ).toBe('Hello Alex, your load is LD-1042');
  });

  it('replaces unknown tokens with empty string and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = substituteVariables('Hello {{unknownVar}}', {});
    expect(result).toBe('Hello ');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing variable'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknownVar'));
    warnSpy.mockRestore();
  });

  it('handles tokens with extra whitespace inside braces', () => {
    expect(substituteVariables('Hi {{ name }}', { name: 'Sam' })).toBe('Hi Sam');
  });

  it('returns the string unchanged when there are no tokens', () => {
    expect(substituteVariables('No tokens here', { name: 'Sam' })).toBe('No tokens here');
  });
});

// ---------------------------------------------------------------------------
// renderTemplate tests (new signature: cachedHtml: string)
// ---------------------------------------------------------------------------
describe('renderTemplate — cached HTML pipeline', () => {
  // -------------------------------------------------------------------------
  // Test 1 (basic): literal HTML + payload + subject
  // -------------------------------------------------------------------------
  it('substitutes variables into HTML and subject, wraps in React Email shell', async () => {
    const cachedHtml = '<h2>Test heading</h2><p>Hello {{name}}</p>';
    const result = await renderTemplate(
      cachedHtml,
      { name: 'World' },
      'Hi {{name}}',
    );

    // Variable substituted in body
    expect(result.html).toContain('Hello World');
    expect(result.html).toContain('Test heading');

    // Variable substituted in subject
    expect(result.subjectFinal).toBe('Hi World');

    // React Email shell wraps in a full HTML document — check for <html> wrapper
    expect(result.html).toMatch(/<html/i);
  });

  // -------------------------------------------------------------------------
  // Test 2 (missing variable): token replaced with empty string
  // -------------------------------------------------------------------------
  it('replaces missing variable tokens with empty string', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cachedHtml = '<p>Hello {{missing}}</p>';
    const result = await renderTemplate(cachedHtml, {}, 'Subject');

    // No unsubstituted tokens remain
    expect(result.html).not.toContain('{{');
    expect(result.html).not.toContain('{{missing}}');

    // warn emitted
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Test 3 (subject-only var): empty body, subject with variable
  // -------------------------------------------------------------------------
  it('substitutes subject variable independently of body', async () => {
    const result = await renderTemplate(
      '',
      { loadNumber: 'LD-9001' },
      'Load {{loadNumber}}',
    );

    expect(result.subjectFinal).toBe('Load LD-9001');
  });
});
