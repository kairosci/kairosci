declare module "subset-font" {
  export default function subsetFont(
    font: import("node:buffer").Buffer,
    chars: string,
    opts: { targetFormat: "woff2" | "woff" | "ttf" },
  ): Promise<import("node:buffer").Buffer>;
}
