interface JQuery<Element extends HTMLElement> {
  addClass(
    className_function:
      | JQuery.TypeOrArray<string>
      | ((this: TElement, index: number, currentClassName: string) => string)
      | (null | undefined | never | false)
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
      | (null | undefined | never | false)
  ): this;
  text(
    text_function:
      | string
      | number
      | boolean
      | ((
          this: TElement,
          index: number,
          text: string
        ) => string | number | boolean)
      | (null | undefined | never | false)
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
      | (null | undefined | never | false)
  ): this;
}
