export type ListMode = "flat" | "tree";

export interface ListElementsInput {
  selector?: string;
  limit?: number;
  depth?: number;
  mode?: ListMode;
}

export interface ElementSummaryItem {
  tag: string;
  id?: string;
  classes?: string[];
  text?: string;
  rect: { x: number; y: number; w: number; h: number };
  visible: boolean;
}

export interface TreeNode {
  tag: string;
  id?: string;
  classes?: string[];
  text?: string;
  children: TreeNode[];
}

export interface ListElementsResult {
  selector: string;
  total: number;
  returned: number;
  truncated: boolean;
  mode: ListMode;
  depth: number;
  items: ElementSummaryItem[];
  tree?: TreeNode[];
  error?: string;
}

export const MAX_LIST_ELEMENTS = 50;
export const MAX_LIST_ITEMS = 50;
export const MAX_ITEM_TEXT = 20;
export const MAX_TREE_DEPTH = 6;
export const MAX_TREE_NODES = 500;
export const MAX_TREE_TEXT = 20;