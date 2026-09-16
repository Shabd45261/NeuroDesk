
+++
disableToc = false
title = "Architecture"
weight = 25
+++

NeuroDesk is an API written in Go that serves as an OpenAI shim, enabling software already developed with OpenAI SDKs to seamlessly integrate with NeuroDesk. It can be effortlessly implemented as a substitute, even on consumer-grade hardware. This capability is achieved by employing various C++ backends, including [ggml](https://github.com/ggerganov/ggml), to perform inference on LLMs using both CPU and, if desired, GPU. Internally NeuroDesk backends are just gRPC server, indeed you can specify and build your own gRPC server and extend NeuroDesk in runtime as well. It is possible to specify external gRPC server and/or binaries that NeuroDesk will manage internally.

NeuroDesk uses a mixture of backends written in various languages (C++, Golang, Python, ...). You can check [the model compatibility table]({{%relref "reference/compatibility-table" %}}) to learn about all the components of NeuroDesk.

![How NeuroDesk works: clients speak one API to a small core, which routes each request over gRPC to separate backend processes pulled on demand](/images/diagrams/architecture-overview.png)


## Backstory

As much as typical open source projects starts, I, [mudler](https://github.com/mudler/), was fiddling around with [llama.cpp](https://github.com/ggerganov/llama.cpp) over my long nights and wanted to have a way to call it from `go`, as I am a Golang developer and use it extensively. So I've created `NeuroDesk` (or what was initially known as `llama-cli`) and added an API to it.

But guess what? The more I dived into this rabbit hole, the more I realized that I had stumbled upon something big. With all the fantastic C++ projects floating around the community, it dawned on me that I could piece them together to create a full-fledged OpenAI replacement. So, ta-da! NeuroDesk was born, and it quickly overshadowed its humble origins.

Now, why did I choose to go with C++ bindings, you ask? Well, I wanted to keep NeuroDesk snappy and lightweight, allowing it to run like a champ on any system and avoid any Golang penalties of the GC, and, most importantly built on shoulders of giants like `llama.cpp`. Go is good at backends and API and is easy to maintain. And hey, don't forget that I'm all about sharing the love. That's why I made NeuroDesk MIT licensed, so everyone can hop on board and benefit from it.

As if that wasn't exciting enough, as the project gained traction, [mkellerman](https://github.com/mkellerman) and [Aisuko](https://github.com/Aisuko) jumped in to lend a hand. mkellerman helped set up some killer examples, while Aisuko is becoming our community maestro. The community now is growing even more with new contributors and users, and I couldn't be happier about it!

Oh, and let's not forget the real MVP here-[llama.cpp](https://github.com/ggerganov/llama.cpp). Without this extraordinary piece of software, NeuroDesk wouldn't even exist. So, a big shoutout to the community for making this magic happen!
