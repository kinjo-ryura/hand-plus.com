/* デモの起動口。**中身は import と mount の 2 行だけ**で、ロジックは demo.js が持つ。

   もとは各ページのインライン <script type="module"> に書いていたが、CSP
   （handball-project#284）で `script-src` に `'unsafe-inline'` を書かずに済ませるため
   外部ファイルへ出した。`'unsafe-inline'` を許すと「どのオリジンの script を許すか」
   以外の防御が全部無くなるので、ここを外に出す価値が 2 行ぶんのコストを上回る。

   **1 本で全ページを賄える**。ES モジュールの import はモジュール自身の URL 基準で
   解決されるので、`./demo.js` はこのファイルの隣を指す — ページの深さ（`demo/` /
   `demo/list/` / `match/<slug>/` / `highlight/<slug>/`）に影響されない。ページ側は
   自分からの相対パスでこのファイルを指すだけでよい。 */
import { mount } from './demo.js';
mount(document.querySelector('[data-demo]'));
