# heloria-next

The Heloria Labs website, rebuilt in Next.js around a single WebGL machine. One fixed
canvas sits beside the page and assembles itself as you scroll, finishing and running
by the time you reach the bottom.

**Live:** https://heloria-next.vercel.app

![Finished machine](renders/finished.png)

## Stack

Next.js 16, React 19, three.js with @react-three/fiber, Tailwind CSS 4, TypeScript.

## How to run

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The mechanism tests run with the `npm run test:*`
scripts in `package.json`.

## More

- [ARCHITECTURE.md](ARCHITECTURE.md): how the page and the machine are put together.
- [renders/](renders/): stills of the machine at each stage.
