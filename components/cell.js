import cs from "classnames";
import { getClassNamesPalletteBySize } from "../functions/createPallette";

export default function Cell(props) {
  const { indexKey, data, onMouseDown, onMouseOver, size } = props;

  const handleTouchMove = (ev) => {
    const touchX = ev.touches[0].pageX - window.pageXOffset;
    const touchY = ev.touches[0].pageY - window.pageYOffset;

    const element = document.elementFromPoint(touchX, touchY);

    if (element) {
      const [y, x] = element.id.split(",");
      onMouseDown({ x, y }, ev);
    }
  };
  return (
    <div
      id={indexKey}
      style={{
        backgroundColor: data?.color,
      }}
      className={cs([
        "border border-gray-400",
        size === 16 &&
          "w-5 h-5 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14",
        size === 32 && "w-2.5 h-2.5 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-7 lg:h-7",
        size === 64 &&
          "w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 lg:w-3.5 lg:h-3.5",
      ])}
      onMouseDown={(ev) => onMouseDown(data, ev)}
      onMouseOver={(ev) => onMouseOver(data, ev)}
      onFocus={(ev) => onMouseOver(data, ev)}
      onTouchMove={handleTouchMove}
    />
  );
}