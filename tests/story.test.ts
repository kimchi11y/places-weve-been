// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { storyHtml } from '../src/lib/story';

/** What a browser makes of it, which is what counts. */
async function page(markdown: string) {
  const box = document.createElement('div');
  box.innerHTML = await storyHtml(markdown);
  return box;
}
const links = async (markdown: string) => [...(await page(markdown)).querySelectorAll('a')].map((a) => a.getAttribute('href'));

describe('the long story', () => {
  it('keeps what Markdown offers', async () => {
    const box = await page('# Day 1\n\n**bold** and [a link](https://example.com/?a=1&b=2)\n\n- one\n- two\n\n> quote\n\n![view](/photos/p1/tile)');
    for (const tag of ['h1', 'strong', 'ul li', 'blockquote', 'img[src="/photos/p1/tile"][alt="view"]']) expect(box.querySelector(tag)).toBeTruthy();
    expect(box.querySelector('a')!.getAttribute('href')).toBe('https://example.com/?a=1&b=2');
    expect(await storyHtml('  \n ')).toBe('');
  });

  it('shows HTML as text instead of running it', async () => {
    const box = await page('Hi <img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n<iframe src="https://evil.example"></iframe>\n\n[<b onclick=alert(1)>x</b>](https://example.com)');
    expect(box.querySelector('script, iframe, img, b')).toBeNull();
    expect(box.innerHTML).not.toMatch(/<[^>]+\son\w+=/);
    expect(box.textContent).toContain('<script>alert(1)</script>');
  });

  it('keeps ordinary links', async () => {
    expect(await links('[a](http://a.example) [b](mailto:a@example.com) [c](/trips/x) [d](#seoul) https://auto.example')).toEqual([
      'http://a.example', 'mailto:a@example.com', '/trips/x', '#seoul', 'https://auto.example',
    ]);
  });

  it('drops links that could run code, however they’re written', async () => {
    const bad = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', '&#106;avascript:alert(1)', '&#x6A;avascript&colon;alert(1)', 'java&Tab;script:alert(1)', 'vbscript:x', 'data:text/html,x', '<java script:alert(1)>'];
    for (const href of bad) {
      const box = await page(`[click](${href}) ![pic](${href})\n\n[ref]\n\n[ref]: ${href}\n\n<${href}>`);
      expect(box.querySelector('a, img')).toBeNull();
      expect(box.textContent).toContain('click');
    }
  });

  it('can’t be talked out of an attribute', async () => {
    const box = await page('[a](https://example.com "x\\" onmouseover=\\"alert(1)") ![b" onerror="alert(1)](https://example.com/x.png)');
    for (const el of box.querySelectorAll('*')) for (const { name } of el.attributes) expect(name).not.toMatch(/^on/);
  });
});
