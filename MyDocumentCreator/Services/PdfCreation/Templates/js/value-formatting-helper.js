/**
 * Formats an inch value in the Imperial style.
 * @param {number} inches - The value in inches.
 * @param {number} [subdivisions=64] - Subdivisions of an inch.
 * @param {string} [separator="-"] - Separator between feet and inches.
 * @param {boolean} [keepZeroFeet=false] - Whether to keep zero feet.
 * @returns {string} - The formatted string.
 */
function formatInchesInImperial(inches, subdivisions = 64, separator = "-", keepZeroFeet = false) {
    // Validate subdivisions
    if (subdivisions < 2 || (Math.log2(subdivisions) % 1 !== 0)) {
        throw new Error(`Argument subdivisions = ${subdivisions} was invalid. 2, 4, 8, 16, 32, 64, etc. was expected.`);
    }

    let wasNegative = false;
    if (inches < 0) {
        wasNegative = true;
        inches *= -1;
    }

    const wholeInches = Math.floor(inches);
    const fractionPart = inches - wholeInches;

    const feetPart = Math.floor(wholeInches / 12);
    const inchesPart = wholeInches % 12;
    let numeratorPart = Math.round(fractionPart * subdivisions);
    const denominatorPart = subdivisions;

    // Reduce the fraction by the GCD
    const gcd = findGcd(numeratorPart, denominatorPart);
    numeratorPart /= gcd;
    const reducedDenominator = denominatorPart / gcd;

    const output =
        (wasNegative ? "-" : "") +
        (feetPart === 0 && !keepZeroFeet ? "" : feetPart + "'" + separator) +
        (inchesPart === 0 ? "" : inchesPart + (numeratorPart === 0 ? "" : " ")) +
        (numeratorPart === 0 ? (inchesPart === 0 ? "0" : "") : numeratorPart + "/" + reducedDenominator) + "\"";

    return output;
}

/**
 * Formats a scale factor in the Imperial style.
 * @param {number} scale - Scale factor to process.
 * @param {number} [subdivisions=64] - Subdivisions of an inch.
 * @param {string} [sideSeparator=" = "] - Separator for the sides.
 * @param {string} [inchFootSeparator="-"] - Separator between feet and inches.
 * @param {number} [rightSideInInches=12] - Value for the right side in inches.
 * @param {boolean} [keepZeroFeet=false] - Whether to keep zero feet.
 * @returns {string} - The formatted string.
 */
function formatScaleInImperial(scale, subdivisions = 64, sideSeparator = " = ", inchFootSeparator = "-", rightSideInInches = 12, keepZeroFeet = false) {
    // Validate scale
    if (scale <= 0) {
        throw new Error(`Argument scale = ${scale} was invalid. A non-zero positive quantity was expected.`);
    }

    // Validate subdivisions
    if (subdivisions < 2 || (Math.log2(subdivisions) % 1 !== 0)) {
        throw new Error(`Argument subdivisions = ${subdivisions} was invalid. 2, 4, 8, 16, 32, 64, etc. was expected.`);
    }

    const leftSideInInches = scale * rightSideInInches;

    return (
        formatInchesInImperial(leftSideInInches, subdivisions, inchFootSeparator, keepZeroFeet) +
        sideSeparator +
        formatInchesInImperial(rightSideInInches, subdivisions, inchFootSeparator, keepZeroFeet)
    );
}