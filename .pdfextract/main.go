// Command pdfextract dumps the plain text of a PDF to stdout.
//
// This is a throwaway development tool used to read the provider API
// documentation. It lives in its own module so it does not add a dependency to
// the backend.
package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/ledongthuc/pdf"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: pdfextract <file.pdf>")
		os.Exit(2)
	}

	f, r, err := pdf.Open(os.Args[1])
	if err != nil {
		fmt.Fprintf(os.Stderr, "open: %v\n", err)
		os.Exit(1)
	}
	defer f.Close()

	total := r.NumPage()
	for i := 1; i <= total; i++ {
		page := r.Page(i)
		if page.V.IsNull() {
			continue
		}

		rows, err := page.GetTextByRow()
		if err != nil {
			fmt.Fprintf(os.Stderr, "page %d: %v\n", i, err)
			continue
		}

		fmt.Printf("\n===== PAGE %d/%d =====\n", i, total)
		for _, row := range rows {
			var b strings.Builder
			for _, w := range row.Content {
				b.WriteString(w.S)
			}
			line := strings.TrimSpace(b.String())
			if line != "" {
				fmt.Println(line)
			}
		}
	}
}
