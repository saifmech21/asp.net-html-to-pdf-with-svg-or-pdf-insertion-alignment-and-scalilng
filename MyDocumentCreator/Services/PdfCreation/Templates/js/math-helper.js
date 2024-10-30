/**
 * Finds the Greatest Common Divisor (GCD) of two integers using the Euclidean Algorithm.
 * @param {number} a - An integer value.
 * @param {number} b - Another integer value.
 * @returns {number} - Returns the GCD.
 */
function findGcd(a, b) {
    if (b === 0) return a;
    return findGcd(b, a % b);
}