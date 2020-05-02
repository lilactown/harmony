type txID = string;

export interface IRef<T> {
    current: T;
    setCurrent: (tx: ITransaction, v: T) => void;
    history: { txID: txID; value: T }[];
}

export interface IAlteration<T> {
    value: T;
    prevTxID: txID;
}

export interface ITransaction {
    id: txID;
    refSets: Map<IRef<any>, IAlteration<any>>;
    alteredRefs: Set<IRef<any>>;
    isAsync: boolean;
}
