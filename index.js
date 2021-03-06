import { interpolateRgbBasis } from "d3-interpolate";

const colors = [
    '#048845',
    '#8490C8',
    '#BF61A5',
    '#EE3124',
    '#FCD700',
    '#5555FF',
    '#9ACA3C',
    '#9F78AC',
    '#F88084',
    '#F5A4C7',
    '#CEE6C1',
    '#FFFF00',
    '#6FC7B6',
    '#D5A768',
    '#D4D4D4',
];

class LazyRulerNumbers {

    // private variable declarations
    constructor(initialSize=0, force=false, base=2, initialSequence=new Set([0,1])) {
        this.depth = initialSize > 0 ? Math.ceil(Math.log(initialSize)/Math.log(base)) : 2;
        this.base = base;
        this.generator = this.rationalNumberGenerator(this.depth)
        this.sequenceSet = initialSequence;

        if (initialSize && force) {
            // force the populating of the sequence upto the size
            for (let i = 0; i < initialSize; i++) {
                this.number().next();
            }
        }

    }

    * rationalNumberGenerator (depth) {

        // Enumerates all of the rationals that exist between 0 and 1, using a given number base and order of magnitude > 1
        // e.g. for base = 2 and depth = 1, enumerate [1/2]
        // e.g. for base = 2 and depth = 2, enumerate [1/4, 2/4, 3/4]
        // e.g. for base = 2 and depth = 5, enumerate [1/32, 2/32, 3/32, 4/32... 31/32] (because 32 = 2^5)
        // e.g. for base = 3 and depth = 2, enumerate [1/9, 2/9, 3/9... 8/9]

        // This class is primarily used with ColorRuler, below.
        // The idea is that if we need new numbers but the interval is closed, we can't increment beyond the interval using the usual i++ approach without normalizing.
        // furthermore if we were to renormalize the colors each time the size of the sequence increased, the colors would be at risk of changing or creating collisions,
        // which defeats the point of having a lazy map of guaranteed unique colors.
        // The way we get around this is by increasing the "resolution" (i.e. "depth" or order of magnitude) of the color space, instead of its size.
        // In other words we find more numbers in between the existing ones, rather than extending and then renormalizing without guarantees of uniqueness.

        // For math nerds, this is analogous to computing p-adic rationals given a base - but in the worst way I could come up with that still works.
        // Not to fear, this is just how ruler numbers are generated: https://en.wikipedia.org/wiki/Dyadic_rational.

        // We stop shy from either n^0 = 1, or numerator = denominator as boundary conditions, since 0 and 1 are already added to the set `sequence` within ColorRuler.
        // Additionally, because n is always less than denominator, it will never exceed 1, guaranteeing that the point stays within the interval [0,1].

        for (let numerator=1; numerator < this.base**depth; numerator++) {
            yield numerator / this.base**depth
        }

    }

    * number() {
        while(true) {
            let maybeNextNumber = this.generator.next();
            if (!maybeNextNumber.done) {
                if (!this.sequenceSet.has(maybeNextNumber)) {
                    this.sequenceSet.add(maybeNextNumber.value)
                    yield maybeNextNumber;
                }
            } else {
                // else:
                // if we've reached our maximum depth and are still looking for more,
                // increase the resolution of the ruler numbers by increasing our depth
                this.depth += 1
                // restart the process
                // TODO: rewrite for memoization?
                this.generator = this.rationalNumberGenerator(this.depth)
                // with the new generator, try to get the next number
                yield this.number().next().value;
            }
        }
    }

    get sequence() {
        return Array.from(this.sequenceSet).sort()
    }
}

/*
"ColorRuler"
Purpose: Represent a color space of arbitrary categorical information, coming in from an interactive system

In other words, we want to compute a unique color, for any string, whenever we want, just-in-time/lazily/on-demand;
and we want to save these label-color associations for later use.

* When you instantiate a new ColorRuler, you can either add items to it, or get colors for items from it.
  * You can add initial items to the color scheme by default.
  * If you get colors for items that don't yet have colors, they are assigned colors automatically.
* You can add as many items as you want. The ColorRuler gets bigger and more precise, the more items you add.
  * Because the ColorRuler gets bigger when more items are added, you can add more items at as they come in,
    supposing if you don't know how many colors you need ahead of time (because you don't know the size of your data)
* You can use d3 interpolators and schemes, instead of the default colors.

By using `GLOBAL_COLOR_SCHEME` (exported below), we can ensure that each color is unique even as more data comes in (since the ruler just
gets more precise, rather than overriding existing colors). Since `GLOBAL_COLOR_SCHEME` is in the widest scope possible,
it will only change when more data comes in to add to colors to it. Otherwise, it's just a static object.

This mapping should last until the script is reloaded. TODO: make it session scope?

Example use:

```js
// NOTE: Whenever possible, use `getColor` instead of `addColor` to prevent collisions
GLOBAL_COLOR_SCHEME.addColor('Jane', 0.25);  // returns an rgb string for "Jane" at scale "0.25", e.g. "rgb(0, 18, 128)"
GLOBAL_COLOR_SCHEME.getColor('Smith');       // produces an rgb string for "Smith", e.g. "rgb(100, 15, 22)" and returns it

GLOBAL_COLOR_SCHEME.colors();   // gets the color map, e.g. { "Smith": "rgb(100, 15, 22)", "Jane": "rgb(0, 18, 128)" }

// An example of the constructor for ColorRuler using an initial set of items, and a different interpolator function.
// Both arguments are optional.
const localColorScheme = new ColorRuler(["Jane", "Smith"], d3.interpolateCubehelixLong)
```

*You may need to use `d3.color` as a helper to convert the rgb string to hexcode.*

As a default, the color scheme for any `ColorRuler` is an interpolated version of the colors already in the utilities file,
using `d3.interpolateRgbBasisClosed` to normalize them against the interval [0, 1].

*/

class ColorRuler {
    constructor(items=[], colorScheme=interpolateRgbBasis(colors)) {
        this.colorScheme = colorScheme;
        this.colorMap = new Map();

        // create a sequence of n=`items.length` amount of rational numbers between 0 and 1
        // the `force` flag (second constructor argument) being true for this instantiation, means that the sequence won't be lazy upto the size of its default items
        // that means we can have n numbers to work with already, rather than having to generate them outside of the object itself
        this.numberGenerator = new LazyRulerNumbers(items.length, true);
        if (items.length > 0) {
            items.forEach((item, index) => this.addColor(item, this.numberGenerator.sequence[index]));
        }
    }

    addColor(item, scale) {
        if (scale >= 0 && scale <= 1) {
            this.colorMap.set(item, this.colorScheme(scale));
            return this.colorMap.get(item);
        }
    }

    getColor(item) {
        // guarantee that a color exists for an item

        // first check if we have the color
        const hasColor = this.colorMap.has(item);

        // if we don't have the color we need to make it
        if (!hasColor) {
            // we make a color for an item, by assigning it a unique scale value, then adding a color in the usual way (using a color scheme interpolator)
            // we don't have to worry about if the color space is big enough - the number generator takes care of that for us
            // TODO: refactor this call for generator to look make it look more clean?
            this.colorMap[item] = this.addColor(item, this.numberGenerator.number().next().value.value);
        }
        return this.colorMap.get(item);
    }

    colors() {
        return Object.fromEntries(this.colorMap.entries());
    }

}

const GLOBAL_COLOR_SCHEME = new ColorRuler();
export {
    ColorRuler,
    GLOBAL_COLOR_SCHEME,
}
