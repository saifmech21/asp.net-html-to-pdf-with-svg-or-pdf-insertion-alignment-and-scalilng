function fitOversizedElement(element) {

    console.log("fitOversizedElement()");

    // get the unscaled dimensions of the element
    const [ elementWidth, elementHeight ] = [element.offsetWidth, element.offsetHeight];
    //console.log("Element Offsets:\n" + element.offsetWidth.toFixed(3) + " x " + element.offsetHeight.toFixed(3));

    // get the rendered dimensions of the container
    const  [ containerWidth, containerHeight ] = getElementSizeWithoutPadding(element.parentElement);
    //console.log("Container Dimensions:\n" + containerWidth.toFixed(3) + " x " + containerHeight.toFixed(3));

    const scale = Math.min(Math.min(containerWidth / elementWidth, containerHeight / elementHeight), 1);
    //console.log("Scale: " + scale.toFixed(3));
    if (scale < 1) {
        element.setAttribute("style", `transform: scale(${scale})`);
    }

    return scale;

}

function getElementSizeWithoutPadding(el) {

    console.log("getElementSizeWithoutPadding()");
    
    // assumptions
    let validUnit = "px";

    // get the bounding rectangle
    let rect = el.getBoundingClientRect();

    //console.log(rect);
    //console.log("element width = " + rect.width.toFixed(3));
    //console.log("element height = " + rect.height.toFixed(3));

    let paddingLeft = 0;
    let paddingRight = 0;
    let paddingTop = 0;
    let paddingBottom = 0;

    const strPaddingLeft = window.getComputedStyle(el).getPropertyValue('padding-left');
    const strPaddingRight = window.getComputedStyle(el).getPropertyValue('padding-right');
    const strPaddingTop = window.getComputedStyle(el).getPropertyValue('padding-top');
    const strPaddingBottom = window.getComputedStyle(el).getPropertyValue('padding-bottom');

    if (strPaddingLeft.endsWith(validUnit) && strPaddingRight.endsWith(validUnit) && strPaddingTop.endsWith(validUnit) && strPaddingBottom.endsWith(validUnit)) {
        paddingLeft = parseFloat(strPaddingLeft.substring(0, strPaddingLeft.indexOf(validUnit)));
        paddingRight = parseFloat(strPaddingRight.substring(0, strPaddingRight.indexOf(validUnit)));
        paddingTop = parseFloat(strPaddingTop.substring(0, strPaddingTop.indexOf(validUnit)));
        paddingBottom = parseFloat(strPaddingBottom.substring(0, strPaddingBottom.indexOf(validUnit)));
        //console.log("padding left = " + paddingLeft.toFixed(3));
        //console.log("padding right = " + paddingRight.toFixed(3));
        //console.log("padding top = " + paddingTop.toFixed(3));
        //console.log("padding bottom = " + paddingBottom.toFixed(3));
    }
    else {
        return null;
    }

    let width = rect.width - paddingLeft - paddingRight;
    let height = rect.height - paddingTop - paddingBottom;

    //console.log("Width w/o padding: " + width.toFixed(3));
    //console.log("Height w/o padding: " + height.toFixed(3));

    return [ width, height ];
}
