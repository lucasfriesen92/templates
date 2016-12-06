
// Document ready
$(function()
{
    // Constants
    var DEFAULT_SHORTCUT_FILLER = "Shortcut"
        , DEFAULT_AUTOTEXT_FILLER = "Expanded Text"
        , DEFAULT_CLEAR_BUFFER_TIMEOUT = 4000          // Default to 750ms

        , KEYCODE_ENTER = 13
        , KEYCODE_TAB = 9
        , KEYCODE_ESC = 27

        , IMAGE_REFRESH_ICON = 'images/third_party/open-iconic/reload-2x.png'
        , IMAGE_REMOVE_ICON = 'images/third_party/open-iconic/trash-2x.png'

        , ANIMATION_FAST = 200
        , ANIMATION_NORMAL = 400
        , ANIMATION_SLOW = 1000
        , TIME_SHOW_CROUTON = 1000 * 3	              // Show croutons for 3s
    ;

    // Variables
    var storageQuota          // Total bytes of sync storage allowed
        , itemStorageQuota    // Max size of a single item in sync storage
        , countQuota          // Max number of items you can store in sync storage
        , adjustedCountQuota  // Max number of items you can store minus metadata
        , metaData = {}       // List of metadata keys we will store / retrieve
    ;

    // Setup metaData defaults
    metaData[SHORTCUT_TIMEOUT_KEY] = DEFAULT_CLEAR_BUFFER_TIMEOUT;
    metaData[SHORTCUT_VERSION_KEY] = APP_VERSION;

    // Set version
    $('#versionHistory').text('v' + APP_VERSION);

    // Set omnibar keyword
    $('#omniboxKeyword').text(chrome.i18n.getMessage("KEYWORD_OMNIBAR_TRIGGER"));

    // Set cursor tracker html
    $('#cursorTrackerHTML').text(CURSOR_TRACKING_HTML);

    // Warn user before leaving if they haven't saved new rows
    $(window).bind('beforeunload', function(){
        if ($('tr:not(.saved)').length) {
            return  'You have unsaved shortcuts!';
        }
    });

	// When user types into input fields
	$('#edit').on('keydown', 'input[type=text], textarea', editRowKeydownHandler);
	$('#edit').on('keyup', 'input[type=text], textarea', editRowKeyupHandler);

    // Detect when user types ESC in document to close modal popups
    $(document).on('keydown', function(event)
    {
		var charCode = event.keyCode || event.which;
        if (charCode == KEYCODE_ESC) {
            $('.popup').fadeOut(ANIMATION_FAST, function() {
                $('.popup, .modal').remove();
            });
        }
    });

	// Need to do the onclick clearing here, inline js not allowed
	$('#edit').on('focus', 'input.shortcut', function(event) {
		if (this.value == DEFAULT_SHORTCUT_FILLER) { this.value = ''; }
	});
	$('#edit').on('focus', 'textarea.autotext', function(event) {
		if (this.value == DEFAULT_AUTOTEXT_FILLER) { this.value = ''; }
	});
	$('#edit').on('blur', 'input.shortcut', function(event) {
		if (this.value == '') { this.value = DEFAULT_SHORTCUT_FILLER; }
	});
	$('#edit').on('blur', 'textarea.autotext', function(event) {
		if (this.value == '') { this.value = DEFAULT_AUTOTEXT_FILLER; }
	});

    // Listen to slider changes
    $('#timeout').on('change mousemove', function(e)
    {
        var timeout = $(this).val();
        metaData[SHORTCUT_TIMEOUT_KEY] = timeout;
        updateShortcutTimeoutLabel(timeout);
    });

	// Button handlers
	$('#restore').click(restoreShortcuts);
	$('#backup').click(backupShortcuts);
	$('#port').click(portShortcuts);
	$('#edit').on('click', '.remove', removeRow);
	$('.refreshButton').click(refreshShortcuts);
	$('.addButton').click(function(event) {
		var row = addRow(null, null, $(this).hasClass('append'));
		if (row) {
			row.find('.shortcut').focus().select();
		}
	});
	$('.saveButton').click(function(event) {
		saveShortcuts();
	});
	$('.backToTop').click(function(event) {
		event.preventDefault();
		$('html, body').animate({scrollTop: 0}, ANIMATION_NORMAL);
	});

	// Prevent form submit
	$('form').submit(function(event) {
		event.preventDefault();
	});

	// Tips link to show / hide tips
	$('#tipsLink').click(toggleTips);

    // Check if we opened the options page with a hash
    var hash = window.location.hash;
    if (hash)
    {
        console.log('Hash:', hash);

        // If it is #tipsLink, trigger tips
        if (hash == "#tipsLink") {
            $(hash).click();
        }
    }

	// Refresh and setup shortcuts
	refreshShortcuts();


    //////////////////////////////////////////////////////////
    // FUNCTIONS

    // Refresh shortcuts using locally stored shortcuts
    function refreshShortcuts()
    {
        // Get existing shortcuts
        chrome.storage.sync.get(null, function(data)
        {
            if (chrome.runtime.lastError) {	// Check for errors
                console.log(chrome.runtime.lastError);
                showCrouton("Error retrieving shortcuts!", 'red');
                return;
            }

            // Update storage quotas
            storageQuota = chrome.storage.sync.QUOTA_BYTES;
            itemStorageQuota = chrome.storage.sync.QUOTA_BYTES_PER_ITEM;
            countQuota = chrome.storage.sync.MAX_ITEMS;
            adjustedCountQuota = countQuota - Object.keys(metaData).length;
            refreshQuotaLabels(data);

            // Retrieve metadata
            processMetaData(data);

            // Setup shortcuts
            setupShortcuts(data);
        });
    }

    // Refresh labels for storage quotas
    function refreshQuotaLabels(shortcuts)
    {
        console.log("refreshQuotaLabels");

        // Check that data is returned
        if (!$.isEmptyObject(shortcuts))
        {
            // Current quotas
            $('#totalStorage').text(JSON.stringify(shortcuts).length);
            $('#countStorage').text(Object.keys(shortcuts).length
                                    - Object.keys(metaData).length);
        }

        // Max quotas
        $('#totalQuota').text(storageQuota);
        $('#countQuota').text(adjustedCountQuota);
    }

    // Process any metadata stored with shortcuts
    function processMetaData(data)
    {
        console.log('processMetaData');

        // Check for shortcut timeout
        var shortcutTimeout = data[SHORTCUT_TIMEOUT_KEY];
        if (shortcutTimeout) {  // If exists, replace metadata
            metaData[SHORTCUT_TIMEOUT_KEY] = shortcutTimeout;
        } else {    // Otherwise, use metadata default value
            shortcutTimeout = metaData[SHORTCUT_TIMEOUT_KEY];
        }
        updateShortcutTimeoutLabel(shortcutTimeout);
        $('#timeout').val(shortcutTimeout);
        console.log('shortcutTimeout:', shortcutTimeout);

        // Check that the shortcut database version matches app version
        var shortcutVersion = data[SHORTCUT_VERSION_KEY];
        console.log('database version:', shortcutVersion);
        if (shortcutVersion && shortcutVersion != metaData[SHORTCUT_VERSION_KEY])
        {
            // Warn user that their shortcuts aren't synced yet, they should refresh
            console.log(chrome.i18n.getMessage("WARNING_SHORTCUT_VERSION_MISMATCH"));
            alert(chrome.i18n.getMessage("WARNING_SHORTCUT_VERSION_MISMATCH"));
            console.log('Database version:', shortcutVersion);
            console.log('Extension version:', metaData[SHORTCUT_VERSION_KEY]);
        }
    }

    // Setup and populate edit table shortcuts
    function setupShortcuts(data, completionBlock)
    {
        console.log("setupShortcuts");

        var errors = false;					// Keep track of errors
        var refreshStartTime = new Date();	// Keep track of time
        $('.refreshButton').find('img').attr('src', 'images/refresh.gif');
        $('#edit').fadeOut(ANIMATION_FAST, function() {
            $(this).html('').fadeIn(ANIMATION_FAST, function()
            {
                if (!$.isEmptyObject(data)) // Check that data is returned
                {
                    // Loop through shortcuts and add to edit table,
                    //  case insensitive sorted by shortcut, sort in reverse
                    var keys = Object.keys(data);
                    keys.sort(function(a, b) {
                        return b.toLowerCase().localeCompare(a.toLowerCase());
                    });
                    $.each(keys, function(index, key)
                    {
                        // Only apply shortcuts
                        if (key.indexOf(SHORTCUT_PREFIX) === 0)
                        {
                            var shortcut = key.substr(SHORTCUT_PREFIX.length);
                            if (!addRow(shortcut, data[key]))
                            {
                                errors = true;
                                return false;	// Break out if over quota
                            }
                        }
                    });

                    // Add special class to these rows to indicate saved
                    $('tr').addClass('saved');

                    // Set textarea height to fit content and resize as user types
                    $('textarea').autosize();

                    // Add extra input field if no existing shortcuts
                    if (!$('tr').length) {
                        addRow().find('.shortcut').focus().select();
                    }
                }
                else	// No shortcuts? Check if first run on this computer
                {
                    chrome.storage.local.get(APP_FIRST_RUN_KEY, function(firstRun)
                    {
                        if (chrome.runtime.lastError) {		// Check for errors
                            console.log(chrome.runtime.lastError);
                        }
                        else if (!firstRun[APP_FIRST_RUN_KEY])		// First run
                        {
                            // Flag first run
                            firstRun[APP_FIRST_RUN_KEY] = true;
                            chrome.storage.local.set(firstRun);
							
							console.log(defaultTemplates)

                            // Example shortcuts
							addRow('#cal', 'YOURCALENDLYLINK');
							addRow('#e', 'YOUREMAILADDRESS');
							addRow('#tpd1.1', "Hope you’re having a great week! As it's the beginning of the month, we're about to get started on your MONTH books. Could you please upload the following:\n\nBank - Account Type (Account #) - Month Year\nVendor - Report Type - Month Year\n\nHere's the link: https://bench.co/document/documents/uploads\n\nThanks for your help!");
                         	addRow('#tpg1.2', "We’ve begun reconciling your  books now that your statements are becoming available.\n\nAs soon as the bookkeeping is complete we’ll let you know that they’re ready for your review. Until then, please let us know if you have any questions.\n\nThanks!");
							addRow('#tpd1.2', "I hope you're doing well! We're working on your MONTH books and need a few additional documents. Could you please upload the following:\n\nBank - Account Type (Account #) - Month Year\nVendor - Report Type - Month Year\n\nYou can upload these documents here: https://bench.co/document/documents/uploads\n\nHave a great day!");
							addRow('#tpg1.2', "I hope you're having a good week! Your books are underway for MONTH. As always, if you have any questions, please don't hesitate to reach out.\n\nCheers!");
							addRow('#tp2.1', "Your books are now reconciled for MONTH. There are a few expenses we need your help categorizing in order to complete your bookkeeping. Can you please leave a comment on each transaction letting us know what they were for?\n\n- Awaiting Category Expense: https://bench.co/reports/awaiting-category/expense\n- Awaiting Category Revenue: https://bench.co/reports/awaiting-category/revenue\n\nThanks!");
							addRow('#tp2.2', "Your books are nearly complete through the month of MONTH. In order to wrap up the bookkeeping, we need your assistance on the following items:\n\nPlease leave a comment on the following transactions to let us know what they were for:\n\nAwaiting Category Expense: https://bench.co/reports/awaiting-category/expense\n\nPlease upload the following documents: \n\nBank - Account Type (Account #) - Month Year\nVendor - Report Type - Month Year\n\nHere is a link to your uploads page: https://app.bench.co/documents/uploads\n\nAs always, if you have any questions, feel free to reach out either through the app or by booking a time to chat here: CAL");
							addRow('#tp3.1', "Happy Monday! MONTH’s books are now complete. I’ve scheduled a Review Call with you on DATETIME to walk you through MONTH’s bookkeeping and to ensure we’re doing everything we can to take bookkeeping off your plate. If you’re busy at the time I’ve scheduled, don’t worry - here’s my calendar link for you to re-schedule: CALENDLY\n\nI’m looking forward to chatting with you!");
							addRow('#un3', "Hope all is well! In order to help keep your bookkeeping up to date, I’ve scheduled a quick 15-minute call with you on DATETTIME. During this call, we’ll work together to clear out the last few items we need your assistance with.\n\nPlease leave a comment next to these transactions describing them each in a little detail: \n\nAwaiting Category Expense: https://bench.co/reports/awaiting-category/expense\n\nPlease upload the following documents:\n\nBank - Account Type - Account # - Month Year\n\nVendor - Report Type - Month Year\n\nHere is a link to your uploads page: https://app.bench.co/documents/uploads\n\nThanks!");
							addRow('#un4.1', "We haven’t heard from you in a while! This is a reminder that we still need a few outstanding items for us to be able to continue working on your books. When you have a moment, can you please help us with the following:Can you provide us with some additional details on the following transactions?\n\nAwaiting Category - Expense: https://bench.co/reports/awaiting-category/expense\n\nIf you would like to go over these items over the phone together, feel free to schedule a call through my calendar.\n\nThank you, CLIENTNAME!");
							addRow("#un4.2", "We haven’t heard from you in a while! This is a reminder that we still need a few outstanding items for us to be able to continue working on your books. When you have a moment, can you please help us with the following:Can you provide us with some additional details on the following transactions?\n\nAwaiting Category - Expense: https://bench.co/reports/awaiting-category/expense\n\nWe also require the following documents:\n\nBank - Account Type - Account # - Month Year\n\nVendor - Report Type - Month Year\n\nPlease upload the documents here: https://app.bench.co/documents/uploads\n\nIf you would like to go over these items over the phone together, feel free to schedule a call through my calendar.\n\nThank you, CLIENTNAME!");
							addRow('#un5', "Not yet");
							addRow('#un6', "Not yet");
							addRow('#tp3.2', "Thanks for commenting on those Awaiting Category Expenses! We’ve categorized them accordingly. With that, your books are now complete for MONTH.\n\nIf you have any questions or would like to review the books together, please don’t hesitate to reach out.");
							addRow('#payroll', "Monthly Payroll Adjustment | %d(Y.)");
							addRow('#stripe', "Monthly Stripe Adjustment | %d(Y.)");
							addRow('#square', "Monthly Square Adjustment | %d(Y.)");					
							addRow('#shopify', "Monthly Shopify Adjustment | %d(Y.)");
							addRow('#help', "All commands begin with # and are followed by a description of the message. Try typing #cal or #e to see what happens. If it doesn't show your calendar and email, find the shortcut below, edit, and save it. Then try again.");
							addRow('#upload', "https://app.bench.co/document/documents/uploads");
							addRow('#ace', "https://bench.co/reports/awaiting-category/expense");
							addRow('#acr', "https://bench.co/reports/awaiting-category/revenue");

                            // Save
                            saveShortcuts();

                            // Set textarea height to fit content and resize as user types
                            $('textarea').autosize();
                        }
                        else    // First run already happened, why no shortcuts??
                        {
                            getLocalBackup(function (data) {    // Check local backup
                                if (!data || $.isEmptyObject(data)) {   // No local backup
                                    getEmergencyBackup(function (data) {    // Check emergency
                                        if (!$.isEmptyObject(data)) {   // Has backup
                                            //  prompt user to use emergency backup
                                            promptEmergencyRestore();
                                        }
                                    });
                                }
                            });
                        }
                    });
                }

                // Add some delay so it looks like it's doing some work
                var refreshTimeInMilliseconds = (new Date()).getTime() - refreshStartTime.getTime();
                var refreshIconRefreshDelay = (1000 - refreshTimeInMilliseconds);
                if (refreshIconRefreshDelay < 0) {
                    refreshIconRefreshDelay = 0;
                }

                // Done! Set refresher icon back and call custom completionBlock
                setTimeout(function()
                {
                    $('.refreshButton').find('img').attr('src', IMAGE_REFRESH_ICON);

                    if (completionBlock) {
                        completionBlock(!errors);
                    }
                }, refreshIconRefreshDelay);
            });
        });

        // Update timestamp of backup
        updateBackupTimestamp();
    }

    // When a row in the edit table gets typed in
    function editRowKeyupHandler(event)
    {
        // Check to see if input pair is valid
        var keyCode = event.keyCode || event.which;
        var $target = $(event.target);
        var $input = $target.parents('tr');
        var $shortcut = $input.find('.shortcut');
        var $autotext = $input.find('.autotext');
        validateRow($input, function(errors)
        {
            // Show / hide error state for shortcut input
            if (errors.shortcut) {
                $shortcut.addClass('error').attr('title', errors.shortcut);
            } else {
                $shortcut.removeClass('error').removeAttr('title');
            }

            // Show / hide error state for autotext textarea
            if (errors.autotext) {
                $autotext.addClass('error').attr('title', errors.autotext);
            } else {
                $autotext.removeClass('error').removeAttr('title');
            }
        });
    }

    // When a row in the edit table gets typed in
    function editRowKeydownHandler(event)
    {
        // Check to see if input pair is valid
        var keyCode = event.keyCode || event.which;
        var $target = $(event.target);

        // If enter pressed on shortcut field, move to autotext
        if (keyCode == KEYCODE_ENTER && $target.hasClass('shortcut'))
        {
            event.preventDefault();		// prevent submitting form
            $target.parents('tr').find('.autotext').focus().select();
        }
    }

    // Remove shortcut row in edit table
    function removeRow(event) {
        $(this).parents('tr').fadeOut('fast', function() {$(this).remove();});
    }

    // Add new row to shortcuts edit table
    function addRow(shortcut, autotext, append)
    {
        if ($('tr').length >= adjustedCountQuota) {
            console.log(chrome.i18n.getMessage("ERROR_OVER_ITEM_QUOTA"));
            showCrouton(chrome.i18n.getMessage("ERROR_OVER_ITEM_QUOTA")
                + " Max # Items: " + adjustedCountQuota, 'red');
            return null;
        }

        var row = $(document.createElement('tr'))
            .append($(document.createElement('td'))
                .append($(document.createElement('input'))
                    .attr('type', 'text')
                    .addClass('shortcut')
                    .attr('value', shortcut || DEFAULT_SHORTCUT_FILLER)
                )
            )
            .append($(document.createElement('td'))
                .append($(document.createElement('textarea'))
                    .addClass('autotext')
                    .text(autotext || DEFAULT_AUTOTEXT_FILLER)
                )
            )
            .append($(document.createElement('td'))
                .append($(document.createElement('a'))
                    .attr('href', '#')
                    .addClass('remove')
                    .attr('title', 'Remove Shortcut')
                    .append($(document.createElement('img'))
                        .attr('src', IMAGE_REMOVE_ICON)
                        .attr('alt', 'x')
                    )
                )
            )
            .hide();

        // Append or prepend
        if (append) {
            row.appendTo('#edit').fadeIn(ANIMATION_FAST);
        } else {
            row.prependTo('#edit').fadeIn(ANIMATION_FAST);
        }
        return row;
    }

    // Validate if row has valid shortcut info
    function validateRow($input, callback)
    {
        // Check for errors
        var errors = {};
        var shortcut = $input.find('.shortcut').val();
        var autotext = $input.find('.autotext').val();

        // Check not empty
        if (!shortcut || shortcut == DEFAULT_SHORTCUT_FILLER || !shortcut.length) {
            errors.shortcut = ' - Invalid shortcut text.';
        }
        if (!autotext || autotext == DEFAULT_AUTOTEXT_FILLER || !autotext.length) {
            errors.autotext = ' - Invalid expanded text.';
        }

        // Check not over max size when stored
        var testObject = {};
        testObject[shortcut] = autotext;
        var itemSize = JSON.stringify(testObject).length;
        if (itemSize >= itemStorageQuota)
        {
            console.log(chrome.i18n.getMessage("ERROR_OVER_SPACE_QUOTA"));
            errors.autotext = " - Over max storage item size. Please reduce shortcut or autotext length.";
        }

        // Callback if given
        if (callback) {
            callback(errors);
        }
        return !errors.shortcut && !errors.autotext;
    }

    // Save shortcuts to chrome sync data
    function saveShortcuts(completionBlock)
    {
        console.log("saveShortcuts");

        // Variable setup
        var duplicates = [];
        var data = {};

        // Add metadata properties back in
        $.each(metaData, function(key, value) {
            data[key] = value;
        });

        // Collect list of valid shortcuts and check for duplicates
        $('tr').each(function(index)
        {
            var $row = $(this);

            // If pair is valid, and no duplicates, add to list
            if (validateRow($row))
            {
                var shortcut = SHORTCUT_PREFIX + $row.find('.shortcut').val();
                if (!data[shortcut]) {
                    data[shortcut] = $row.find('.autotext').val();
                } else {
                    duplicates.push(shortcut);
                }
            }
        });

        // Check duplicates and warn user
        if (duplicates.length)
        {
            console.log(chrome.i18n.getMessage("ERROR_DUPLICATE_ITEMS"));
            showModalPopup(chrome.i18n.getMessage("ERROR_DUPLICATE_ITEMS")
                + '\n - ' + duplicates.join('\n - '));
            return false;
        }

        // Check storage capacity
        if (JSON.stringify(data).length >= storageQuota)
        {
            console.log(chrome.i18n.getMessage("ERROR_OVER_SPACE_QUOTA"));
            showCrouton(chrome.i18n.getMessage("ERROR_OVER_SPACE_QUOTA")
                + " Chrome max capacity: " + storageQuota + " characters", 'red');
            return false;
        }
        if (Object.keys(data).length >= countQuota)
        {
            console.log(chrome.i18n.getMessage("ERROR_OVER_SPACE_QUOTA"));
            showCrouton(chrome.i18n.getMessage("ERROR_OVER_SPACE_QUOTA")
                + " Chrome max capacity: " + storageQuota + " characters", 'red');
            return false;
        }

        // Clear old synced data
        chrome.storage.sync.clear(function()
        {
            if (chrome.runtime.lastError) {
                console.log(chrome.runtime.lastError);
            }
            else	// Success! Old data cleared
            {
                // Save data into storage
                chrome.storage.sync.set(data, function()
                {
                    if (chrome.runtime.lastError) {
                        console.log(chrome.runtime.lastError);
                        showCrouton("Error saving shortcuts!", 'red');
                    }
                    else	// Success! Data saved
                    {
                        console.log("saveShortcuts success:", data);

                        // Run through valid shortcuts and set them as saved
                        $('tr').each(function(index)
                        {
                            var $row = $(this);
                            if (data[SHORTCUT_PREFIX + $row.find('.shortcut').val()]) {
                                $row.addClass('saved');
                            }
                        });

                        // Set textarea height to fit content and resize as user types
                        $('textarea').autosize();

                        // Update quota labels
                        refreshQuotaLabels(data);

                        // Run completion block if exists
                        if (completionBlock) {
                            completionBlock();
                        } else {
                            showCrouton('Shortcuts saved!', 'green', true);	// Indicate success saving
                        }
                    }
                });
            }
        });
    }

    // Save backup of shortcuts
    function backupShortcuts()
    {
        showModalPopup(chrome.i18n.getMessage("MESSAGE_BACKUP_WARNING") + " Continue?",
            function(response) {
                if (response)
                {
                    saveShortcuts(function() {
                        chrome.storage.sync.get(null, function(data)
                        {
                            if (chrome.runtime.lastError) {	// Check for errors
                                console.log(chrome.runtime.lastError);
                                showCrouton("Error retrieving shortcuts!", 'red');
                            }
                            else	// Save backup of shortcuts
                            {
                                var backup = {};
                                backup[APP_BACKUP_KEY] = data;
                                backup[APP_BACKUP_TIMESTAMP_KEY] = new Date().getTime();
                                chrome.storage.local.set(backup, function()
                                {
                                    if (chrome.runtime.lastError) {	// Check for errors
                                        console.log(chrome.runtime.lastError);
                                        showCrouton(chrome.i18n.getMessage("ERROR_BACKUP_FAILED"), 'red');
                                    }
                                    else {	// Show success
                                        showCrouton('Shortcuts backed up locally!', 'green', true);
                                        updateBackupTimestamp();
                                    }
                                });
                            }
                        });
                    });
                }
            }, true);
    }

    // Update backup timestamp time
    function updateBackupTimestamp()
    {
        chrome.storage.local.get(APP_BACKUP_TIMESTAMP_KEY, function(data)
        {
            if (chrome.runtime.lastError) {	// Check for errors
                console.log(chrome.runtime.lastError);
            }
            else if (data)	// Set date
            {
                var timestamp = data[APP_BACKUP_TIMESTAMP_KEY];
                if (timestamp) {
                    var date = new Date(timestamp).toLocaleString();
                    console.log("Last local backup date: " + date);
                    $('#restore').text(date).removeClass('disabled');
                } else {
                    console.log("No last backup date");
                    $('#restore').text("never").addClass('disabled');
                }
            }
        });
    }

    // Updates the shortcut timeout label
    function updateShortcutTimeoutLabel(value) {
        $('#timeoutValue').text(' [' + value + 'ms]');
    }

    // Get local backup, completionBlock parameter is required and should take an object
    function getLocalBackup(completionBlock)
    {
        chrome.storage.local.get(APP_BACKUP_KEY, function(data)
        {
            if (chrome.runtime.lastError)	// Check for errors
            {
                console.log(chrome.runtime.lastError);
                showCrouton("Error retrieving backup!", 'red');
            }
            else {  // Pass data along
                completionBlock(data);
            }
        });
    }

    // Get emergency local backup, completionBlock parameter required and should take an object
    function getEmergencyBackup(completionBlock)
    {
        chrome.storage.local.get(APP_EMERGENCY_BACKUP_KEY, function(data)
        {
            if (chrome.runtime.lastError)	// Check for errors
            {
                console.log(chrome.runtime.lastError);
                showCrouton("Error retrieving backup!", 'red');
            }
            else {  // Pass data along
                completionBlock(data);
            }
        });
    }

    // Prompt user for restoring synced data via emergency backup
    function promptEmergencyRestore()
    {
        showModalPopup(chrome.i18n.getMessage("MESSAGE_EMERGENCY_RESTORE_WARNING"),
            function(response) {
                if (response)
                {
                    getEmergencyBackup(function(data)	// Restore using emergency backup
                    {
                        console.log("Restoring emergency backup shortcuts: ",
                            data[APP_EMERGENCY_BACKUP_KEY]);
                        chrome.storage.sync.set(data[APP_EMERGENCY_BACKUP_KEY], function()
                        {
                            if (chrome.runtime.lastError) 	// Check for errors
                            {
                                console.log(chrome.runtime.lastError);
                                showCrouton(chrome.i18n.getMessage("ERROR_RESTORE_FAILED"), 'red');
                            }
                            else 	// Show success
                            {
                                showCrouton('Shortcuts restored!', 'green', true);
                                refreshShortcuts();
                            }
                        });
                    });
                }
            }, true);
    }

    // Restore shortcuts from backup
    function restoreShortcuts()
    {
        // Only enable if restore is not disabled
        if ($('#restore').hasClass('disabled')) {
            return showCrouton("You need to make a backup first!", 'red');
        }

        // Confirm restore
        showModalPopup(chrome.i18n.getMessage("MESSAGE_RESTORE_WARNING") + " Continue?",
            function(response) {
                if (response)
                {
                    getLocalBackup(function(data)	// Restore using backup shortcuts
                    {
                        console.log("Restoring shortcuts: ", data[APP_BACKUP_KEY]);
                        chrome.storage.sync.set(data[APP_BACKUP_KEY], function()
                        {
                            if (chrome.runtime.lastError) 	// Check for errors
                            {
                                console.log(chrome.runtime.lastError);
                                showCrouton(chrome.i18n.getMessage("ERROR_RESTORE_FAILED"), 'red');
                            }
                            else 	// Show success
                            {
                                showCrouton('Shortcuts restored!', 'green', true);
                                refreshShortcuts();
                            }
                        });
                    });
                }
            }, true);
    }

    // Import / export shortcuts option
    function portShortcuts()
    {
        showPortView(function(newShortcuts)
        {
            console.log('new shortcuts:', newShortcuts);

            // Check if it's valid json, parse it
			//var TEMPLATES = "chrome-extension://mmnnifaaijikkbljhkkfapnigncgfglg/TEMPLATES.json"
            try {
                newShortcuts = JSON.parse(TEMPLATES);
            } catch (exception) {
                showCrouton(chrome.i18n.getMessage("ERROR_IMPORT_INVALID_JSON"), 'red');
                return;
            }

            // Check if it's an array, has to be an object
            if ($.isArray(newShortcuts)) {
                showCrouton(chrome.i18n.getMessage("ERROR_IMPORT_NOT_OBJECT"), 'red');
                return;
            }

            // Loop through and add prefix to shortcuts and metadata to new store
            var shortcuts = {};
            $.each(newShortcuts, function(key, value) {
                shortcuts[SHORTCUT_PREFIX + key] = value;
            });
            shortcuts[SHORTCUT_VERSION_KEY] = metaData[SHORTCUT_VERSION_KEY];

            // Go through and try to set them up as new shortcuts,
            // should go through built-in validation for item quotas.
            setupShortcuts(shortcuts, function(success)
            {
                // Show message to user
                if (success) {
                    showCrouton(chrome.i18n.getMessage("MESSAGE_IMPORT_SUCCESS"), 'orange', true);
                } else {
                    showCrouton(chrome.i18n.getMessage("ERROR_IMPORT_ADDING_ROWS"), 'red');
                }

                // Set rows to unsaved style
                $('tr').removeClass('saved');
            });
        });
    }

    // Create and show a warning message crouton that can be dismissed or autohide
    function showCrouton(message, color, autohide)
    {
        $('body').append($(document.createElement('div'))
            .addClass('crouton').addClass(color || 'green').text(message)
            .fadeIn(ANIMATION_FAST, function()
            {
                if (autohide)
                {
                    $(this).delay(TIME_SHOW_CROUTON).fadeOut(ANIMATION_FAST, function() {
                        $(this).remove();
                    })
                }
                else    // Show a close button
                {
                    $(this).append($(document.createElement('button'))
                        .addClass('closeButton').text('x')
                        .click(function(e) {
                            $(this).parents('.crouton').fadeOut(ANIMATION_FAST, function() {
                                $(this).remove();
                            });
                        })
                    );
                }
            })
        );
    }

    // Create and show modal popup with action button
    function showModalPopup(message, completionBlock, isConfirm)
    {
        $(document.createElement('div'))
            .addClass('modal')
            .hide()
            .appendTo('body')
            .fadeIn(ANIMATION_FAST)
            .click(function() {
                $('.popup').fadeOut(ANIMATION_FAST, function()
                {
                    $('.popup, .modal').remove();
                    if (completionBlock) {
                        completionBlock(false);
                    }
                });
            });
        $(document.createElement('div'))
            .addClass('popup')
            .append($(document.createElement('h2'))
                .text(chrome.i18n.getMessage("TITLE_WARNING_POPUP"))
            )
            .append($(document.createElement('p'))
                .html(message.replace(/\n/g, '<br />'))
            )
            .append($(document.createElement('span'))
                .css('float', 'right')
                .css('text-align', 'right')
                .append($(document.createElement('button'))
                    .attr('type', 'button')
                    .css('display', (isConfirm ? 'inline-block' : 'none'))
                    .text('Cancel')
                    .click(function()
                    {
                        $('.popup').fadeOut(ANIMATION_FAST, function() {
                            $('.popup, .modal').remove();
                            if (completionBlock) {
                                completionBlock(false);
                            }
                        });
                    })
                )
                .append($(document.createElement('button'))
                    .attr('type', 'button')
                    .css('margin-left', '4px')
                    .text('Ok')
                    .click(function()
                    {
                        $('.popup').fadeOut(ANIMATION_FAST, function() {
                            $('.popup, .modal').remove();
                            if (completionBlock) {
                                completionBlock(true);
                            }
                        });
                    })
                )
            )
            .hide()
            .appendTo('body')
            .fadeIn(ANIMATION_FAST);
    }

    // Create and show modal with import / export optiopns
    function showPortView(completionBlock)
    {
        // Get existing shortcuts
        chrome.storage.sync.get(null, function(data)
        {
            if (chrome.runtime.lastError) {	// Check for errors
                console.log(chrome.runtime.lastError);
                showCrouton("Error retrieving shortcuts!", 'red');
            }
            else	// Parse json and show
            {
                console.log('showPortView', data);

                // Collect just the shortcuts, minus the prefix
                var shortcuts = {};
                $.each(data, function(key, value) {
                    if (key.indexOf(SHORTCUT_PREFIX) === 0) {
                        shortcuts[key.substr(SHORTCUT_PREFIX.length)] = value;
                    }
                });

                // Build and show modal
                $(document.createElement('div'))
                    .addClass('modal')
                    .hide()
                    .appendTo('body')
                    .fadeIn(ANIMATION_FAST)
                    .click(function() {
                        $('.popup').fadeOut(ANIMATION_FAST, function() {
                            $('.popup, .modal').remove();
                        });
                    });
                $(document.createElement('div'))
                    .addClass('popup').addClass('port')
                    .append($(document.createElement('h2'))
                        .text(chrome.i18n.getMessage("TITLE_PORT_VIEW_POPUP"))
                    )
                    .append($(document.createElement('p'))
                        .html(chrome.i18n.getMessage("TEXT_PORT_VIEW_POPUP"))
                    )
                    .append($(document.createElement('textarea'))
                        .attr('id', 'portJSON')
                        .val(JSON.stringify(shortcuts, undefined, 2))
                    )
                    .append($(document.createElement('span'))
                        .css('float', 'right')
                        .css('text-align', 'right')
                        .append($(document.createElement('button'))
                            .attr('type', 'button')
                            .css('display', 'inline-block')
                            .text('Cancel')
                            .click(function() {
                                $('.popup').fadeOut(ANIMATION_FAST, function() {
                                    $('.popup, .modal').remove();
                                });
                            })
                        )
                        .append($(document.createElement('button'))
                            .attr('type', 'button')
                            .css('margin-left', '4px')
                            .text('Save')
                            .click(function() {
                                $('.popup').fadeOut(ANIMATION_FAST, function()
                                {
                                    if (completionBlock) {
                                        completionBlock($('#portJSON').val());
                                    }
                                    $('.popup, .modal').remove();
                                });
                            })
                        )
                    )
                    .hide()
                    .appendTo('body')
                    .fadeIn(ANIMATION_FAST);

                // Resize as user types
                $('#portJSON').autosize();
            }
        });
    }

    // Toggle to show and hide tips
    function toggleTips(event) {
        $('#tipsList').slideToggle();
    }

});
