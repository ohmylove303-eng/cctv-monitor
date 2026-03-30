declare module 'mgrs' {
    export function forward(ll: [number, number], accuracy?: number): string;
    export function inverse(mgrs: string): [number, number, number, number];
    export function toPoint(mgrs: string): [number, number];

    const mgrs: {
        forward: typeof forward;
        inverse: typeof inverse;
        toPoint: typeof toPoint;
    };

    export default mgrs;
}
