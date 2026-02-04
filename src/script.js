(async function () {
    const baseURL = new URL('.', location.href);
    // fetch a JSON file and parse it
    async function getJSON(path) {
        const resp = await fetch(new URL(path, baseURL));
        if (!resp.ok) throw new Error(`Failed to load ${path}: ${resp.status}`);
        return resp.json();
    }

    // recursively replace $ref objects with the actual schema data
    async function resolveRefs(schema, seen = new Set()) {
        if (schema === null || schema === undefined) return null;
        if (Array.isArray(schema)) return Promise.all(schema.map(item => resolveRefs(item, seen)));
        if (typeof schema !== 'object') return schema;

        if (schema.$ref && typeof schema.$ref === 'string') {
            if (seen.has(schema.$ref)) throw new Error(`circular $ref detected: ${schema.$ref}`);
            seen.add(schema.$ref);
            const refSchema = await getJSON(schema.$ref);
            const resolved = await resolveRefs(refSchema, seen);
            seen.delete(schema.$ref);
            return resolved;
        }

        const result = {};
        for (const [key, val] of Object.entries(schema)) {
            result[key] = await resolveRefs(val, seen);
        }
        return result;
    }

    // builds the HTML form from a resolved schema object
    // namePrefix is used to build hierarchical names for nested fields (e.g., "parent.child")
    function buildForm(schema, container, namePrefix = '') {
        container.innerHTML = ''; // clear the "Loading..." message

        if (!schema || typeof schema !== 'object') {
            container.innerHTML = '<p style="color:red;">Error: The schema is invalid.</p>';
            return;
        }

        if (schema.properties && typeof schema.properties === 'object') {
            for (const [propKey, propValue] of Object.entries(schema.properties)) {
                if (!propValue || typeof propValue !== 'object') continue;

                const formGroup = document.createElement('div');
                formGroup.className = 'form-group';

                // Handle nested objects
                if (propValue.type === 'object') {
                    const label = document.createElement('label');
                    label.textContent = propValue.title || propKey;
                    formGroup.appendChild(label);

                    const nestedContainer = document.createElement('div');
                    nestedContainer.className = 'nested-field';

                    // Create the full name for the parent object
                    const parentName = namePrefix ? `${namePrefix}.${propKey}` : propKey;
                    buildForm(propValue, nestedContainer, parentName);

                    formGroup.appendChild(nestedContainer);
                } else {
                    // Handle simple fields
                    const label = document.createElement('label');
                    label.textContent = propValue.title || propKey;

                    const requiredFields = Array.isArray(schema.required) ? schema.required : [];
                    if (requiredFields.includes(propKey)) {
                        label.className = 'required';
                    }

                    let input;
                    // ... (input creation logic is the same as before) ...
                    if (propValue.enum && Array.isArray(propValue.enum)) {
                        input = document.createElement('select');
                        propValue.enum.forEach(option => {
                            const optionElement = document.createElement('option');
                            optionElement.value = option;
                            optionElement.textContent = option;
                            input.appendChild(optionElement);
                        });
                    } else if (propValue.type === 'integer') {
                        input = document.createElement('input');
                        input.type = 'number';
                        input.step = '1';
                    } else if (propValue.type === 'number') {
                        input = document.createElement('input');
                        input.type = 'number';
                    } else if (propValue.type === 'string' && propValue.format === 'date-time') {
                        input = document.createElement('input');
                        input.type = 'datetime-local';
                    } else {
                        input = document.createElement('input');
                        input.type = 'text';
                    }

                    if (input) {
                        input.id = propKey;
                        // Use the prefix to create a full name
                        const fullName = namePrefix ? `${namePrefix}.${propKey}` : propKey;
                        input.name = fullName;
                        formGroup.appendChild(input);
                    }
                }
                container.appendChild(formGroup);
            }
        }
    }


    // main execution logic
    try {
        const masterSchema = await getJSON('schema.json');
        const fullResolvedSchema = await resolveRefs(masterSchema);
        const formContainer = document.getElementById('form-container');

        buildForm(fullResolvedSchema, formContainer);

        // TODO: proper form data collection + download
        document.getElementById('download-btn').addEventListener('click', () => {
            const formData = {};
            document.querySelectorAll('#form-container input, #form-container select').forEach(el => {
                if (el.type === 'datetime-local') {
                    // convert datetime-local to ISO string for consistency
                    formData[el.name] = el.value ? new Date(el.value).toISOString() : '';
                } else { // TODO: are there any other cases needed here?
                    formData[el.name] = el.value;
                }
            });
            console.log('Form Data:', formData);
            alert('Check the browser console for the collected form data!');
            /* https://workflow-automation.podio.com/catch/5h7nk1roqum0bq9 */
        });
    } catch (e) {
        console.error(e);
        document.getElementById('form-container').innerHTML =
            '<p style="color:red;">Error loading schema: ' + e.message + '</p>';
    }
})();