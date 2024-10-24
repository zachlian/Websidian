package main

import (
	"fmt"
	"html/template"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/russross/blackfriday/v2"
)

// Obsidian markdown directory
const obsidianDir = "./notes"

func renderMarkdownToHTML(mdContent []byte) template.HTML {
	// Convert markdown to HTML using blackfriday
	output := blackfriday.Run(mdContent)
	return template.HTML(output)
}

func listMarkdownFiles() ([]string, error) {
	var files []string
	err := filepath.Walk(obsidianDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && filepath.Ext(path) == ".md" {
			files = append(files, path)
		}
		return nil
	})
	return files, err
}

func main() {
	r := gin.Default()

	// Load HTML templates
	r.LoadHTMLGlob("templates/*")

	// Route for displaying markdown as HTML
	r.GET("/", func(c *gin.Context) {
		files, err := listMarkdownFiles()
		if err != nil {
			c.String(http.StatusInternalServerError, "Error listing files: %v", err)
			return
		}

		// Display first markdown file as an example
		if len(files) == 0 {
			c.String(http.StatusNotFound, "No markdown files found.")
			return
		}

		mdFile := files[0]
		mdContent, err := ioutil.ReadFile(mdFile)
		if err != nil {
			c.String(http.StatusInternalServerError, "Error reading file: %v", err)
			return
		}

		htmlContent := renderMarkdownToHTML(mdContent)
		c.HTML(http.StatusOK, "index.html", gin.H{
			"content": htmlContent,
		})
	})

	// Start the server
	err := r.Run(":8080")
	if err != nil {
		fmt.Printf("Error starting server: %v\n", err)
	}
}
