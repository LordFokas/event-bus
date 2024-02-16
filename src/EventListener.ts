import { EventConsumer, type Event } from "./Event.js";

export class EventListener<T extends Event> {
	name: string|null;
	owner: string|null;
	private readonly callback: EventConsumer<T>;
	private readonly _nice: number;
	private target?: object;
	$channels: symbol[] = [];

	constructor(callback:EventConsumer<T>, nice = Nice.DEFAULT){
		this.name = null;
		this.owner = null;
		this.callback = callback;
		if(nice < Nice.MIN_VALUE || nice > Nice.MAX_VALUE){
			throw new Error(`Constraint Violated: ${Nice.MIN_VALUE} <= nice(${nice}) <= ${Nice.MAX_VALUE}`);
		}
		this._nice = nice;
	}

	onEvent(event:T){
		this.callback.call(this.target, event);
	}

	nice(){
		return this._nice;
	}

	named(name:string, owner:string){
		this.name = name;
		this.owner = owner;
		return this;
	}

	bind(target:object){
		this.target = target;
		return this;
	}
}

export enum Nice {
    MIN_VALUE    = -20_000,
    PRE_PROCESS  = -10_000,
    DEFAULT      =       0,
    POST_PROCESS =  10_000,
    MAX_VALUE    =  20_000,
}