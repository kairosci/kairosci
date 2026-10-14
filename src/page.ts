import { z } from "zod";
import { esc } from "./console.ts";
import { last, need } from "./defined.ts";
import { profileSchema } from "./schemas.ts";
import { CREDIT_POST, CREDIT_URL } from "./shared.ts";
import { render } from "./templates.ts";

const PHONE_QUERY = "(max-width: 600px)";

export class Page {
  files = new Map<string, string>();
  rows: string[][] = [];
  raw = "";

  add(file: string, pair: [string, string], width: string, alt: string, href: string | null, sameRow = false): void {
    this.files.set(file, need(pair[0], `page ${file}`));
    this.files.set(`phone/${file}`, need(pair[1], `phone page ${file}`));
    const text = esc(alt.replace(/\s+/g, " ").trim());
    const img = render("readme/readme-pic", {
      query: PHONE_QUERY,
      raw: need(this.raw === "" ? null : this.raw, "asset base"),
      file,
      width,
      alt: text,
    });
    const html = href === null ? img : render("readme/readme-link", { href: esc(href), img });
    if (sameRow && this.rows.length > 0) {
      last(this.rows, "readme row").push(html);
    } else {
      this.rows.push([html]);
    }
  }

  readme(profile: z.infer<typeof profileSchema>): string {
    return render("readme/readme-doc", {
      rows: this.rows.map((r) => r.join("")).join("\n"),
      repo: profile.profileRepo,
      creditUrl: CREDIT_URL,
      creditPost: CREDIT_POST,
    });
  }
}
