import * as fs from 'fs-extra'
import * as path from 'path'

export function generateGithubCodeTable(lines: string[]): string {
    const code = lines
        .map(line =>
            line
                .split('')
                .map((c, i) => `<span data-char="${i}">${c}</span>`)
                .join('')
        )
        .map(
            (line, i) => `<tr>
         <td id="L${i + 1}" class="blob-num js-line-number" data-line-number="${i + 1}"></td>
        <td id="LC${i +
            1}" class="blob-code blob-code-inner js-file-line"><span class="characters-wrapper">${line}</span></td>
      </tr>`
        )
        .join('\n')

    const styles = fs.readFileSync(path.join(__dirname, 'styles.css')).toString()

    return `<div class="github-testcase">
      <style>
          ${styles}
      </style>
      <div class="container">
          <div class="file">
              <div itemprop="text" class="blob-wrapper data">
                  <table><tbody>${code}</tbody></table>
              </div>
          </div>
      </div>
  </div>`
}
