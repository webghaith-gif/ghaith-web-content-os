# Ghaith Web Content OS — Architecture

```mermaid
flowchart LR
    A[Reports / Intelligence] --> B[Opportunity Engine]
    B --> C[Content Generation]
    C --> D[Images / Carousel / Video]
    D --> E[IN REVIEW]
    E -->|Human approval| F[READY]
    F --> G[ClickUp READY]
    G --> H[Make Watch Tasks]
    H --> P{Platform Adapter / Router}
    P --> FB[Facebook]
    P --> IG[Instagram]
    P --> TT[TikTok]
    P --> PIN[Pinterest]
    P --> YT[YouTube]
    P --> X[X]
    P --> N[Any future platform]
    FB --> L[Make result callback / ClickUp logs]
    IG --> L
    TT --> L
    PIN --> L
    YT --> L
    X --> L
    N --> L
    L --> R[SUCCESS / WARNING / ERROR]
    R --> PUB[PUBLISHED]
    PUB --> M[Metrics / Dashboard / Analytics]

    OA[ChatGPT / OpenAI] -.-> B
    OA -.-> C
    SEM[Semrush] -.-> B
    CAN[Canva] -.-> D
    HEY[HeyGen] -.-> D
    GD[Google Drive] -.-> D
```

The default `PUBLISH_MODE=clickup_watch` mirrors the existing Ghaith Web flow. An optional `webhook` mode remains available for direct app → Make dispatch.
