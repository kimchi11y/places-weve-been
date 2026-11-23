import { Marked, type Tokens } from 'marked';

/** Anything else, like "javascript:", could run code for whoever reads the story. */
const SAFE_LINK = /^(https?:\/\/|mailto:|\/|#)/i;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const markdown = new Marked({
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text),
    // `false` leaves it to marked
    link(token) {
      return SAFE_LINK.test(token.href) ? false : this.parser.parseInline(token.tokens);
    },
    image: ({ href, text }) => (SAFE_LINK.test(href) ? false : escapeHtml(text)),
  },
});

/** A trip's long story: Markdown only. HTML in it is shown as it was typed. */
export const storyHtml = async (story: string) => (story.trim() ? markdown.parse(story) : '');
