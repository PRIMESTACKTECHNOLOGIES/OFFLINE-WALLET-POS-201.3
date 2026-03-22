-- Schema for POS Offline System (Protocol 201.3)

CREATE TABLE [dbo].[PaymentCodes] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [Code] NVARCHAR(6) NOT NULL UNIQUE, -- The 6-digit code or STAN
    [Amount] DECIMAL(18, 2) NOT NULL,
    [Currency] NVARCHAR(3) DEFAULT 'USD',
    [Used] BIT DEFAULT 0,
    [UsedAt] DATETIME NULL,
    [UsedByMerchant] NVARCHAR(50) NULL,
    [Reference] NVARCHAR(100) NULL, -- Transaction ID from App
    [CreatedAt] DATETIME DEFAULT GETUTCDATE()
);

GO

-- Stored Procedure to Redeem a Code (Live)
CREATE PROCEDURE [dbo].[sp_RedeemCode]
    @Code NVARCHAR(6),
    @Amount DECIMAL(18, 2),
    @MerchantId NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Id INT;
    DECLARE @CurrentAmount DECIMAL(18, 2);
    DECLARE @IsUsed BIT;

    SELECT @Id = Id, @CurrentAmount = Amount, @IsUsed = Used
    FROM PaymentCodes
    WHERE Code = @Code;

    IF @Id IS NULL
    BEGIN
        SELECT 0 AS Success, 'Invalid code' AS Message;
        RETURN;
    END

    IF @IsUsed = 1
    BEGIN
        SELECT 0 AS Success, 'Code already used' AS Message;
        RETURN;
    END

    IF @CurrentAmount != @Amount
    BEGIN
        SELECT 0 AS Success, 'Amount mismatch' AS Message;
        RETURN;
    END

    UPDATE PaymentCodes
    SET Used = 1, UsedAt = GETUTCDATE(), UsedByMerchant = @MerchantId
    WHERE Id = @Id;

    SELECT 1 AS Success, 'Payment successful' AS Message, @Id AS Reference;
END;
