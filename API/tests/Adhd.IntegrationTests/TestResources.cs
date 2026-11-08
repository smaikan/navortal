// Her koleksiyon gerçek PostgreSQL ve uygulama hostları açar. Yarış testleri kendi Task.WhenAll çağrılarını korur.
[assembly: CollectionBehavior(MaxParallelThreads = 2)]
