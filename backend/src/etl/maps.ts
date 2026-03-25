export function buildMap(data: any[], key: string) {
    const map = new Map<string, any>();

    for (const item of data) {
        if (item[key]) {
            map.set(item[key], item);
        }
    }

    return map;
}