/*
All types here are copied from @types/jquery and have been modified to accept falsy values (as jquery actually does)
*/
// declare module "jquery" {
  interface JQuery<TElement = HTMLElement> extends Iterable<TElement> {
    addClass(
      className_function:
        | JQuery.TypeOrArray<string>
        | ((this: TElement, index: number, currentClassName: string) => string)
        | (void | null | undefined | false)
    ): this;
    html(
      htmlString_function:
        | JQuery.htmlString
        | JQuery.Node
        | ((
            this: TElement,
            index: number,
            oldhtml: JQuery.htmlString
          ) => JQuery.htmlString | JQuery.Node)
        | (void | null | undefined | false)
    ): this;
    text(
      htmlString_function:
        | JQuery.htmlString
        | JQuery.Node
        | ((
            this: TElement,
            index: number,
            oldhtml: JQuery.htmlString
          ) => JQuery.htmlString | JQuery.Node)
        | (void | null | undefined | false)
    ): this;
    attr(
      attributeName: string,
      value_function:
        | string
        | number
        | null
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
        | ((
            this: TElement,
            index: number,
            attr: string
          ) => string | number | void | undefined)
        | (void | null | undefined | false)
    ): this;
  }
// }
