export interface GetComputedStyleInput {
  selector: string;
  properties?: string[];
}

export interface GetComputedStyleResult {
  selector: string;
  found: boolean;
  styles: Record<string, string>;
  error?: string;
}

export const DEFAULT_STYLE_PROPERTIES: ReadonlyArray<string> = [
  "display",
  "visibility",
  "opacity",
  "position",
  "z-index",
  "width",
  "height",
  "padding",
  "margin",
  "color",
  "background-color",
  "font-size",
];

export const MAX_STYLE_PROPERTIES = 10;