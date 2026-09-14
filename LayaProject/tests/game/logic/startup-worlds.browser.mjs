import startupProbe from "./startup.browser.mjs";
import uiWorldsProbe from "./ui-worlds.browser.mjs";
import nativeUIBindingsProbe from "./native-ui-bindings.browser.mjs";
import worldEventsProbe from "../../framework/world-events.browser.mjs";
import worldTimeProbe from "../../framework/world-time.browser.mjs";
import networkProbe from "../../framework/network.browser.mjs";

export default function startupWorldsProbe() {
    return `(async () => {
        const bindings = await ${nativeUIBindingsProbe()};
        const startup = await ${startupProbe()};
        const worlds = await ${uiWorldsProbe()};
        const events = await ${worldEventsProbe()};
        const time = await ${worldTimeProbe()};
        const network = await ${networkProbe()};
        return { passed: bindings.passed && startup.passed && worlds.passed && events.passed && time.passed && network.passed,
            bindings, startup, worlds, events, time, network };
    })()`;
}
