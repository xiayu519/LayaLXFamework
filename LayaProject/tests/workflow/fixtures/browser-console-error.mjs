export default function () {
    return `(() => { console.error('intentional browser error'); return { passed: true }; })()`;
}
