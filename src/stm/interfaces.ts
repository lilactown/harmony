export interface IRef<T> {
    current: T;
    setCurrent: (tx: ITransaction, v: T) => void;
    history: { txID: number; value: T }[];
}

export interface IAlteration<T> {
    value: T;
    prevTxID: number;
}

export interface ITransaction {
    id: number;
    refSets: Map<IRef<any>, IAlteration<any>>;
    alteredRefs: Set<IRef<any>>;
    isAsync: boolean;
}
