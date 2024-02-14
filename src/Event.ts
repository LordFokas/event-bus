import { EventBus, root } from "./EventBus.js";
import { EventListener } from "./EventListener.js";

const $ = Symbol('$');
const key = Symbol('key');

export type EventConsumer<T extends Event> = (evt:T) => void;

export class Event {
    private static [key] = root;
    private readonly [$]: EventState;

    /** Get the key Symbol for this event. Used as a key in the EventBus. */
    static key(){
        if(!this[key]){
            this[key] = Symbol();
        }
        return this[key];
    }

    key(){
        return (this.constructor as typeof Event).key();
    }

    private promise: Promise<Event>;
    private resolver: (success: boolean) => void;

    constructor(){
        Object.defineProperty(this, $, {
			writable: false,
			configurable: false,
			enumerable: false,
			value: new EventState({
				status: EventStatus.RUNNING,
				deliveries: [],
				depth: 0,
				bus: EventBus.GLOBAL
			})
		});

        this.promise = new Promise((resolve, reject) => {
            this.resolver = success => success ? resolve(this) : reject(this[$].reason);
        });
    }

    /** Assign all data from the passed in objects to the event. Chainable. */
    with<T extends Event>(this: T, ...props : Partial<T>[]) : T {
        return Object.assign(this, ...props);
    }

    /** Set an event as this event's parent and assign all its data to it. Chainable. */
	inherit<T extends Event>(this: T, parent:Event&Partial<T>) : T {
        return this.parent(parent).with(parent);
    }

    /** Set a different event bus. Chainable. */
    bus(bus:EventBus) : this
    /** Get the event bus. */
    bus() : EventBus
	bus(bus?:EventBus){
        if(bus){
            this[$].bus = bus;
            return this;
        }else{
            return this[$].bus;
        }
    }

    /** Set this event's parent. Chainable. */
	parent(parent:Event) : this
    /** Get this event's parent. */
	parent() : Event
	parent(parent?:Event){
		if(parent){
			this[$].parent = parent;
			this[$].depth = parent[$].depth + 1;
			return this;
		}else{
			return this[$].parent;
		}
	}

    /** Publish this event to its event bus. Returns a promise. */
    publish(){
        if(this[$].status.finished){
            throw new Error("Event has already finished");
        }
        this[$].bus.publish(this);
        return this.resolution();
    }

    /** Get this event's promise. */
    resolution(){
        return this.promise as Promise<this>;
    }

    /** Mark this event as finished. Used by the EventBus. Resolves the event's promise. */
    finish(){
        if(!this[$].status.finished){
            this[$].status = EventStatus.FINISHED;
        }
        this.resolver(!this[$].status.aborted);
    }

    /** Abort this event. This halts processing due to an error condition. */
    abort(reason = "ABORT: Reason not defined."){
		this[$].status = EventStatus.ABORTED;
		this[$].reason = reason;
	}

    /** Stop this event. This halts processing as a success condition. */
	stop(reason = "STOP: Reason not defined."){
		this[$].status = EventStatus.STOPPED;
		this[$].reason = reason;
	}

    /** Get the event status. */
	status(){ return this[$].status; }
    /** Get the reason for this event status. */
	reason(){ return this[$].reason; }
    /** Get the depth of this event in the event tree. */
	depth(){ return this[$].depth; }
    /** Get the number of listeners this event was delivered to. */
	count(){ return this[$].deliveries.length; }

    /** Mark this event has been delivered to the given listener. */
	delivered(listener:EventListener<Event>){
		this[$].deliveries.push(listener);
		return this;
	}

    /** Traverse a tree of objects with this event as root, and return the value at the end. */
	traverse(...keys:string[]){
		let obj:Record<string, any> = this;
		for(const key of keys){
			if(!obj) return undefined;
			obj = obj[key];
		}
		return obj;
	}

    /** Type cast read of a field in this event. */
	read<T>(field:string) : T {
		return (this as any as Record<string, T>)[field] as T;
	}

    /** Type cast write to a field in this event. */
	write<T>(field:string, value:T){
		(this as any as Record<string, T>)[field] = value;
	}

    /** Delete a field in this event. */
	delete(field:string){
		delete (this as any as Record<string, any>)[field];
	}
}

/** Internal event state, not meant to be used outside this module. */
class EventState {
    /** The event's current status */
    status: EventStatus;
    /** The reason for the event's current status. Used for STOPPED and ABORTED */
    reason?: string;
    /** The event this event spawned from, if any. */
    parent?: Event;
    /** How deep this event is in the event tree. */
    depth: number;
    /** Which listeners this event was delivered to during processing. */
    deliveries: EventListener<any>[];
    /** The event bus to process this event. Defaults to EventBus.GLOBAL */
    bus: EventBus;

    constructor(obj: EventState){
        for(const key of Object.keys(obj)){
			Object.defineProperty(this, key, {
				writable: true,
				configurable: false,
				enumerable: false,
				value: (obj as Record<string, any>)[key]
			});
		}
		Object.seal(this);
    }
}

export class EventStatus {
    /** Wether the event finished its course */
    readonly finished: boolean;
    /** Wether the course of the event was stopped under error conditions */
    readonly aborted: boolean;
    /** Wether the course of the event was stopped under success conditions */
    readonly stopped: boolean;

    constructor(finished: boolean, aborted: boolean, stopped: boolean){
        this.finished = finished;
        this.aborted = aborted;
        this.stopped = stopped;
    }

    /** Fresh event, never used or currently being processed. */
    static readonly RUNNING  = new EventStatus(false, false, false);
    /** Event ran to completion with success */
    static readonly FINISHED = new EventStatus( true, false, false);
    /** Event ran with success but was stopped and might not have reached every listener */
    static readonly STOPPED  = new EventStatus( true, false,  true);
    /** Event was aborted due to an error, further listeners were not reached */
    static readonly ABORTED  = new EventStatus( true,  true, false);
}