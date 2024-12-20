import { BaseType } from "d3-selection";

declare module "d3-selection" {
  interface Selection<
    GElement extends BaseType,
    Datum,
    PElement extends BaseType,
    PDatum,
  > {
    select<SelectedElement extends SVGGElement>(selector: `g.${string}`): Selection<SelectedElement, Datum, PElement, PDatum>;

    // select<SelectedElement extends BaseType>(selector: string): Selection<SelectedElement, Datum, PElement, PDatum>;
  }
}
