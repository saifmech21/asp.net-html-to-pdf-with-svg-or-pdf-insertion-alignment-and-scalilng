/**
 * Resizes an SVG element to the overall bounding box of its geometries.
 * @param {SVGElement} elSvg - The SVG element to be resized.
 */
function svgResizeToContent(elSvg) {

    if (elSvg == null) {
        console.log("function svgResizeToContent():\nelSvg was null.");
        return;
    }

    //const svgEl = document.querySelector(".my-document .drawing-space svg");
    const { xMin, yMin, xMax, yMax } = getSvgBoundingBox(elSvg);

    const viewBoxAttrValue = `${xMin} ${yMin} ${xMax - xMin} ${yMax - yMin}`;

    let log = "Geometry bounding box:\n" + viewBoxAttrValue;
    //console.log(log);

    elSvg.setAttribute("viewBox", viewBoxAttrValue);
    elSvg.setAttribute("width", (xMax - xMin));
    elSvg.setAttribute("height", (yMax - yMin));
}

/**
 * Applies a scale factor to the specified SVG element by modifying its width and height attributes.
 * @param {SVGElement} elSvg - The SVG element to be resized.
 */
function svgResizeByScaleFactor(elSvg, factor = 1.0) {
    if (elSvg == null) {
        console.log("function svgResizeByScaleFactor():\nelSvg was null.");
        return;
    }
    console.log(`Factor: ${factor}`);
    const width = elSvg.getAttribute("width");
    const height = elSvg.getAttribute("height");
    console.log(`Current Dimensions: ${width} x ${height}`);
    elSvg.setAttribute("width", width * factor);
    elSvg.setAttribute("height", height * factor);
    console.log(`New Dimensions: ${elSvg.getAttribute("width")} x ${elSvg.getAttribute("height")}`);
}

/**
 * Determines the overall bounding box of the geometries contained in an SVG element.
 * @param {SVGElement} elSvg - The SVG element to be inspected.
 */
function getSvgBoundingBox(elSvg) {

    // logging, assumptions for logging
    let colWidth = 10;
    let headers = `${"Element".padStart(colWidth, " ")}${"Id".padStart(colWidth, " ")}${"xMin".padStart(colWidth, " ")}${"yMin".padStart(colWidth, " ")}${"xMax".padStart(colWidth, " ")}${"yMax".padStart(colWidth, " ")}${"width".padStart(colWidth, " ")}${"height".padStart(colWidth, " ")}`;
    console.log(`${headers}\n`);

    // Initialize accumulators with Infinity and -Infinity
    let xMin = Infinity;
    let yMin = Infinity;
    let xMax = -Infinity;
    let yMax = -Infinity;

    // Loop through child elements
    for (const child of elSvg.children) {

        try {

            // Get child's bounding box
            const { x, y, width, height } = child.getBBox();

            // logging
            let log =
                child.tagName.padStart(colWidth, " ") +
                child.id.padStart(colWidth, " ") +
                x.toFixed(3).padStart(colWidth, " ") +
                y.toFixed(3).padStart(colWidth, " ") +
                (x + width).toFixed(3).padStart(colWidth, " ") +
                (y + height).toFixed(3).padStart(colWidth, " ") +
                width.toFixed(3).padStart(colWidth, " ") +
                height.toFixed(3).padStart(colWidth, " ") + "\n";
            console.log(log);

            // Update accumulators
            xMin = Math.min(xMin, x);
            yMin = Math.min(yMin, y);
            xMax = Math.max(xMax, x + width);
            yMax = Math.max(yMax, y + height);

        } catch (error) { }

    }

    // logging
    let result = "The resultant bounding box:\n" +
        "".padStart(colWidth, "-") +
        "".padStart(colWidth, "-") +
        xMin.toFixed(3).padStart(colWidth, " ") +
        yMin.toFixed(3).padStart(colWidth, " ") +
        xMax.toFixed(3).padStart(colWidth, " ") +
        yMax.toFixed(3).padStart(colWidth, " ") +
        (xMax - xMin).toFixed(3).padStart(colWidth, " ") +
        (yMax - yMin).toFixed(3).padStart(colWidth, " ") + "\n";
    console.log(result);

    return { xMin, yMin, xMax, yMax };

}
function getSvgBoundingBox2(elSvg) {

    // logging, assumptions for logging
    let colWidth = 10;
    let log = "Element".padStart(colWidth, " ") +
        "Id".padStart(colWidth, " ") +
        "xMin".padStart(colWidth, " ") +
        "yMin".padStart(colWidth, " ") +
        "xMax".padStart(colWidth, " ") +
        "yMax".padStart(colWidth, " ") +
        "width".padStart(colWidth, " ") +
        "height".padStart(colWidth, " ") + "\n";
    console.log(log);

    // Initialize accumulators with Infinity and -Infinity
    let xMin = Infinity;
    let yMin = Infinity;
    let xMax = -Infinity;
    let yMax = -Infinity;

    // Loop through child elements
    for (const child of elSvg.children) {

        // Skip certain types of elements
        if (child.tagName.toLowerCase() === "defs" || child.tagName.toLowerCase() === "style" || child.tagName === "clipPath") {
            continue;
        }

        // logging
        console.log("Tag: " + child.tagName);

        // Get child's bounding box
        const { x, y, width, height } = child.getBBox();

        // logging
        log =
            child.tagName.padStart(colWidth, " ") +
            child.id.padStart(colWidth, " ") +
            x.toFixed(3).padStart(colWidth, " ") +
            y.toFixed(3).padStart(colWidth, " ") +
            (x + width).toFixed(3).padStart(colWidth, " ") +
            (y + height).toFixed(3).padStart(colWidth, " ") +
            width.toFixed(3).padStart(colWidth, " ") +
            height.toFixed(3).padStart(colWidth, " ") + "\n";
        console.log(log);

        // Update accumulators
        xMin = Math.min(xMin, x);
        yMin = Math.min(yMin, y);
        xMax = Math.max(xMax, x + width);
        yMax = Math.max(yMax, y + height);

    }

    // logging
    log += "The resultant bounding box:\n" +
        "".padStart(colWidth, "-") +
        "".padStart(colWidth, "-") +
        xMin.toFixed(3).padStart(colWidth, " ") +
        yMin.toFixed(3).padStart(colWidth, " ") +
        xMax.toFixed(3).padStart(colWidth, " ") +
        yMax.toFixed(3).padStart(colWidth, " ") +
        (xMax - xMin).toFixed(3).padStart(colWidth, " ") +
        (yMax - yMin).toFixed(3).padStart(colWidth, " ") + "\n";

    return { xMin, yMin, xMax, yMax };

}
