import React, { useMemo, useState } from 'react';
import { Card, Radio, Upload, Button, Alert, Spin, Table, Typography, Space, Divider, message } from 'antd';
import type { RadioChangeEvent } from 'antd/es/radio';
import type { RcFile, UploadFile } from 'antd/es/upload/interface';
import { useAppDispatch, useAppSelector } from 'app/config/store';
import { AUTHORITIES } from 'app/config/constants';
import { analyzeWithGemini, saveToBackend, setImagesBase64, setMode, setPreview, setRawText } from '../book-import.slice';
import type { PreviewChapter, PreviewLesson } from '../book-import.slice';

const { Title, Text, Paragraph } = Typography;

const BookImportPage = () => {
  const dispatch = useAppDispatch();
  const { mode, loading, error, preview } = useAppSelector(state => state.bookImport);
  const account = useAppSelector(state => state.authentication.account);
  const hasStaffAuthority = (account?.authorities || []).includes(AUTHORITIES.STAFF);

  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [imageNames, setImageNames] = useState<string[]>([]);

  const disabled = !hasStaffAuthority;

  const handleModeChange = (event: RadioChangeEvent) => {
    dispatch(setMode(event.target.value));
    if (event.target.value === 'file') {
      setImageNames([]);
      dispatch(setImagesBase64([]));
    } else {
      setFileList([]);
      dispatch(setRawText(undefined));
    }
  };

  const handleFileBeforeUpload = (file: RcFile) => {
    if (disabled) {
      return Upload.LIST_IGNORE;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'pdf' || extension === 'docx') {
      message.warning('convert to .txt for best results');
    }

    const reader = new FileReader();
    reader.onload = event => {
      const { result } = event.target ?? {};
      dispatch(setRawText(typeof result === 'string' ? result : ''));
    };
    reader.readAsText(file);

    setFileList([file]);
    return false;
  };

  const handleFileRemove = () => {
    setFileList([]);
    dispatch(setRawText(undefined));
  };

  const handleScanInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }

    const files = Array.from(event.target.files || []);

    if (files.length === 0) {
      dispatch(setImagesBase64([]));
      setImageNames([]);
      return;
    }

    Promise.all(
      files.map(
        file =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = loadEvent => {
              const { result } = loadEvent.target ?? {};
              resolve(typeof result === 'string' ? result : '');
            };
            reader.onerror = () => reject(new Error('Unable to read file'));
            reader.readAsDataURL(file);
          }),
      ),
    )
      .then(base64List => {
        dispatch(setImagesBase64(base64List.filter(Boolean)));
        setImageNames(files.map(file => file.name));
      })
      .catch(() => {
        message.error('Failed to load one or more images.');
      });
  };

  const handleAnalyze = async () => {
    if (disabled) {
      return;
    }

    const action = await dispatch(analyzeWithGemini());
    if (analyzeWithGemini.fulfilled.match(action)) {
      message.success('Preview generated successfully.');
    } else {
      const msg = (typeof action.payload === 'string' && action.payload) || action.error.message || 'Unable to analyze content.';
      message.error(msg);
    }
  };

  const handleSave = async () => {
    if (disabled) {
      return;
    }

    const action = await dispatch(saveToBackend());
    if (saveToBackend.fulfilled.match(action)) {
      message.success('Import request submitted.');
    } else {
      const msg = (typeof action.payload === 'string' && action.payload) || action.error.message || 'Unable to save import.';
      message.error(msg);
    }
  };

  const moveChapter = (index: number, direction: number) => {
    if (!preview) {
      return;
    }

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= preview.chapters.length) {
      return;
    }

    const chapters = [...preview.chapters];
    const [removed] = chapters.splice(index, 1);
    chapters.splice(newIndex, 0, removed);
    dispatch(setPreview({ ...preview, chapters }));
  };

  const updateChapterTitle = (index: number, value: string) => {
    if (!preview) {
      return;
    }

    const chapters = preview.chapters.map((chapter, idx) =>
      idx === index
        ? {
            ...chapter,
            chapterTitle: value || `Chapter ${index + 1}`,
          }
        : chapter,
    );

    dispatch(setPreview({ ...preview, chapters }));
  };

  const chapterData = useMemo(
    () =>
      preview?.chapters.map((chapter, index) => ({
        key: index,
        index,
        ...chapter,
      })) || [],
    [preview],
  );

  const lessonColumns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: 'Items (count)',
      dataIndex: 'items',
      key: 'itemsCount',
      render: (items: string[]) => items.length,
    },
    {
      title: 'Preview',
      key: 'preview',
      render: (_: unknown, record: PreviewLesson) => record.items.join(', '),
    },
  ];

  const chapterColumns = [
    {
      title: 'Chapter Title',
      dataIndex: 'chapterTitle',
      key: 'chapterTitle',
      render: (text: string, record: PreviewChapter & { index: number }) => (
        <Paragraph editable={{ onChange: value => updateChapterTitle(record.index, value) }} style={{ margin: 0 }}>
          {text}
        </Paragraph>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: PreviewChapter & { index: number }) => (
        <Space>
          <Button size="small" onClick={() => moveChapter(record.index, -1)} disabled={record.index === 0}>
            Up
          </Button>
          <Button size="small" onClick={() => moveChapter(record.index, 1)} disabled={record.index === (preview?.chapters.length || 0) - 1}>
            Down
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card title="Book Import" bordered={false} style={{ maxWidth: 1200, margin: '24px auto' }}>
      {!hasStaffAuthority && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Only staff members can use the book import tool."
          description="You are signed in without the required ROLE_STAFF authority, so the controls below are disabled."
        />
      )}

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Radio.Group value={mode} onChange={handleModeChange} optionType="button" buttonStyle="solid" disabled={disabled}>
          <Radio.Button value="file">File</Radio.Button>
          <Radio.Button value="scan">Scan</Radio.Button>
        </Radio.Group>

        {mode === 'file' ? (
          <div>
            <Upload
              beforeUpload={handleFileBeforeUpload}
              onRemove={handleFileRemove}
              fileList={fileList}
              accept=".txt,.md,text/plain,text/markdown"
              disabled={disabled}
            >
              <Button disabled={disabled}>Select Text File</Button>
            </Upload>
            {fileList.length > 0 && (
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                {fileList[0].name}
              </Text>
            )}
          </div>
        ) : (
          <div>
            <input type="file" accept="image/*" capture="environment" multiple onChange={handleScanInputChange} disabled={disabled} />
            {imageNames.length > 0 && (
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                {imageNames.join(', ')}
              </Text>
            )}
          </div>
        )}

        {error && <Alert type="error" showIcon message={error} />}

        <Space>
          <Button type="primary" onClick={handleAnalyze} loading={loading} disabled={disabled}>
            Analyze with Gemini
          </Button>
          <Button onClick={handleSave} loading={loading || false} disabled={disabled || !preview}>
            Confirm &amp; Save
          </Button>
        </Space>

        <Spin spinning={loading} tip="Processing...">
          {preview && (
            <div>
              <Divider orientation="left">Preview</Divider>
              <Title level={4}>{preview.bookTitle}</Title>
              <Table
                dataSource={chapterData}
                columns={chapterColumns}
                expandable={{
                  expandedRowRender: record => (
                    <Table
                      dataSource={(record.lessons || []).map((lesson: PreviewLesson, idx: number) => ({
                        key: idx,
                        ...lesson,
                      }))}
                      columns={lessonColumns}
                      pagination={false}
                      size="small"
                    />
                  ),
                }}
                pagination={false}
                rowKey="index"
              />
            </div>
          )}
        </Spin>
      </Space>
    </Card>
  );
};

export default BookImportPage;
