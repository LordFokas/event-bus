import { Event, EventConsumer } from "./Event.js";
import { EventListener, Nice } from "./EventListener.js";

export class EventBus {
    /** The global, application-wide EventBus. */
    static readonly GLOBAL = new EventBus("global");

    /** List of listeners for each event type */
    private readonly channels = {
        // Make sure Event base class exists at all times to kill recursion here.
        [Event.key()]: [] as EventListener<any>[]
    };

    /** List of own key and all ancestor keys for each event type */
    private readonly hierarchy = {
        // Make sure Event base class exists at all times to kill recursion here.
        [Event.key()]: [Event.key()]
    };

    private log : EventConsumer<any> = (_:any) => {};
    readonly name: string;

    constructor(name: string){
        this. name = name;
    }

    /** Sets the debug logger to use internally */
    logger(log: EventConsumer<any>){
        this.log = log;
    }

    /**
     * Automatically create and subscribe a listener for an event.
     * @param type Event type to listen to
     * @param name Name of the event within the caller's context
     * @param owner Name of the owner of this subscription
     * @param callback Callback function to process this event
     * @param nice Optional nice value for this listener
     * @returns Created listener
     */
    listen<T extends typeof Event>(type: T, name: string, owner: string, callback: EventConsumer<InstanceType<T>>, nice=Nice.DEFAULT){
        const listener = new EventListener<InstanceType<T>>(callback, nice).named(name, owner);
        this.subscribe(type, listener);
        return listener;
    }

    /** Subscribe to an event type. If the event has subtypes, it also applies to the subtypes. */
    subscribe<T extends typeof Event>(type: T, listener: EventListener<InstanceType<T>>){
        const key = type.key();
        if(!this.channels[key]){
            this.channels[key] = [];
            this.calculate(key, type);
        }else if(this.channels[key].includes(listener)){
            throw new Error("Cannot add a listener twice to the same channel!");
        }
        this.channels[key].push(listener);
        listener.$channels.push(key);
    }

    /** Unsubscribe a list from all of its subscriptions. */
    unsubscribe(listener: EventListener<any>){
        listener.$channels.map(
            c => this.channels[c] = this.channels[c].filter(
                l => l !== listener
            )
        );
        listener.$channels = [];
    }

    /** Build and cache the list of event supertypes for an event type. */
    private calculate<E extends typeof Event>(key: symbol, event: E){
        if(this.hierarchy[key]) return; // Skip computation if node already exists.

        const superEvent = event.prototype; // Get parent event class
        const superKey = superEvent.key();
        if(!this.hierarchy[superKey]){ // If parent doesn't have key set
            this.calculate(superKey, Event); // Recursively calculate missing ancestor key sets
        }

        // Our key set is our key and the set of keys of our ancestors
        // So our list is just our own key and the list of keys on our parent
        this.hierarchy[key] = [ key, ...this.hierarchy[superKey] ];
    }

    /**
     * Publish an event to the event bus.
     * This runs all listeners for this type (and parent types) in order until
     * the whole list is consumed or the event stops / aborts.
     * Each event can only be processed once.
     */
    publish(event: Event){
        if(event.status().finished){
            throw new Error("This event has already been processed!");
        }
        const key = event.key();
        this.hierarchy[key] // Get all supertype and own keys
            .map(k => this.channels[k]) // Get all listeners for every key
            .flat() // Flatten listener[][] into listener[]
            .sort((a, b) => a.nice() - b.nice()) // Order listeners by nice, ascending.
            .some(l => this.execute(l, event)); // Execute listeners in order until one execute() returns true.
        event.finish();
        this.log(event);
    }

    /**
     * Have a listener consume an event.
     * If there is an error or the event is stopped,
     * the chain is severed and the next listener does not execute.
     */
    private execute(listener: EventListener<any>, event: Event){
        try{
            listener.onEvent(event.delivered(listener))
            return event.status().finished;
        }
		catch(err){
			event.abort("Aborted due to error during listener execution");
			console.error(err, listener, event);
			return true; // Stop the listener chain
		}
    }
}