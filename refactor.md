# Refactor to Borda

## Description

Aims to refactor the code to use the Borda method.


## Client

before
```ts
    init({...})
    query(...)
```

after
```ts
    const borda = new Borda({...});
    borda.query(...)
```

goal: replace `Client``


