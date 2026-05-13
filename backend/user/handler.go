package sos

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
	return &Handler{
		service: service,
	}
}

func (h *Handler) CreateSOS(c *gin.Context) {
	var req CreateSOSDTO

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	result, err := h.service.CreateSOS(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "SOS Created",
		"data":    result,
	})
}

func (h *Handler) GetAllSOS(c *gin.Context) {
	result, err := h.service.GetAllSOS()

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": result,
	})
}

func (h *Handler) GetSOSByTicketID(c *gin.Context) {
	ticketID := c.Param("ticket_id")

	result, err := h.service.GetSOSByTicketID(ticketID)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "ticket not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": result,
	})
}

func (h *Handler) UpdateStatus(c *gin.Context) {
	ticketID := c.Param("ticket_id")

	var body struct {
		Status string `json:"status"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	err := h.service.UpdateStatus(ticketID, body.Status)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "status updated",
	})
}

func (h *Handler) UpdateUrgent(c *gin.Context) {
	ticketID := c.Param("ticket_id")

	var body struct {
		Urgent string `json:"urgent"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	err := h.service.UpdateUrgent(ticketID, body.Urgent)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "urgent updated",
	})
}